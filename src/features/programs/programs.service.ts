import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Not, Repository } from 'typeorm';
import { NewProgram, UpdateProgram } from './dto/program.dto';
import { ProgramResponseDto } from './dto/program-response.dto';
import { ProgramsEntity } from './entity/programs.entity';
import { BULK_CREATE_LIMIT } from '../../common/constants/bulk.constant';
import { PublicationStatus } from '../../common/enums/publication-status.enum';
import { MediaEntity } from '../media/entity/media.entity';
import { MediaTargetType, MediaType } from '../../common/enums/media.enum';

@Injectable()
export class ProgramsService {
  constructor(
    @InjectRepository(ProgramsEntity)
    private readonly programsRepository: Repository<ProgramsEntity>,
    @InjectRepository(MediaEntity)
    private readonly mediaRepository: Repository<MediaEntity>,
  ) {}

  async createProgram(dto: NewProgram): Promise<ProgramResponseDto> {
    if (dto.featuredMediaId) {
      throw new BadRequestException('Add a program image after creating the program');
    }
    const slug = this.toSlug(dto.slug ?? dto.name);

    const program = this.programsRepository.create({
      ...dto,
      slug,
      name: dto.name.trim(),
      summary: this.cleanOptionalText(dto.summary),
      description: this.cleanOptionalText(dto.description),
      featuredMediaId: null,
    });
    const saved = await this.programsRepository.save(program);
    return ProgramResponseDto.fromEntity(saved);
  }

  async createBulkPrograms(
    payloads: NewProgram[],
  ): Promise<ProgramResponseDto[]> {
    if (payloads.length === 0 || payloads.length > BULK_CREATE_LIMIT) {
      throw new BadRequestException(
        `Submit between 1 and ${BULK_CREATE_LIMIT} programs`,
      );
    }
    const programs: ProgramResponseDto[] = [];
    for (const payload of payloads) {
      programs.push(await this.createProgram(payload));
    }
    return programs;
  }

  async findAllPrograms(): Promise<ProgramResponseDto[]> {
    const programs = await this.programsRepository.find({
      relations: { conferences: { conference: true } },
      order: { name: 'ASC' },
    });
    await this.attachFeaturedMedia(programs);
    return programs.map((program) => ProgramResponseDto.fromEntity(program));
  }

  async findPublishedPrograms(): Promise<ProgramResponseDto[]> {
    const programs = await this.programsRepository.find({
      where: { publicationStatus: PublicationStatus.PUBLISHED },
      relations: { conferences: { conference: true } },
      order: { name: 'ASC' },
    });
    await this.attachFeaturedMedia(programs);
    return programs.map((program) => ProgramResponseDto.fromEntity(program));
  }

  async findProgramByID(
    id: string,
    withDeleted = false,
  ): Promise<ProgramResponseDto> {
    const program = await this.loadProgram(id, withDeleted, {
      conferences: { conference: true, events: true },
    });
    await this.attachFeaturedMedia([program]);
    return ProgramResponseDto.fromEntity(program);
  }

  async updateProgram(
    id: string,
    dto: UpdateProgram,
  ): Promise<ProgramResponseDto> {
    const program = await this.loadProgram(id);
    const slug = dto.slug ? this.toSlug(dto.slug) : program.slug;
    await this.ensureUnique(slug, id);

    await this.programsRepository.manager.transaction(async (manager) => {
      const { featuredMediaId, ...updates } = dto;
      let featuredMedia: MediaEntity | null = null;

      if (featuredMediaId !== undefined) {
        const mediaRepository = manager.getRepository(MediaEntity);
        await mediaRepository.update(
          {
            targetType: MediaTargetType.PROGRAM,
            targetId: program.id,
            mediaType: MediaType.IMAGE,
          },
          { isFeatured: false },
        );
        if (featuredMediaId) {
          featuredMedia = await this.findFeaturedProgramImage(
            manager,
            program.id,
            featuredMediaId,
          );
          featuredMedia.isFeatured = true;
          await mediaRepository.save(featuredMedia);
        }
      }

      Object.assign(program, {
        ...updates,
        slug,
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.summary !== undefined
          ? { summary: this.cleanOptionalText(dto.summary) }
          : {}),
        ...(dto.description !== undefined
          ? { description: this.cleanOptionalText(dto.description) }
          : {}),
        ...(featuredMediaId !== undefined
          ? { featuredMediaId: featuredMedia?.id ?? null }
          : {}),
      });
      await manager.getRepository(ProgramsEntity).save(program);
    });
    return this.findProgramByID(id);
  }

  async softDeleteProgram(id: string): Promise<void> {
    await this.loadProgram(id);
    await this.programsRepository.softDelete(id);
  }

  async restoreProgram(id: string): Promise<ProgramResponseDto> {
    await this.loadProgram(id, true);
    await this.programsRepository.restore(id);
    return this.findProgramByID(id);
  }

  private async loadProgram(
    id: string,
    withDeleted = false,
    relations?: { conferences: { conference: boolean; events?: boolean } },
  ): Promise<ProgramsEntity> {
    const program = await this.programsRepository.findOne({
      where: { id },
      withDeleted,
      relations,
    });
    if (!program)
      throw new NotFoundException(`Program with ID ${id} not found`);
    return program;
  }

  private async ensureUnique(slug: string, excludedId?: string): Promise<void> {
    const existing = await this.programsRepository.findOne({
      where: [{ slug, ...(excludedId ? { id: Not(excludedId) } : {}) }],
      withDeleted: true,
    });
    if (existing) {
      throw new ConflictException('Program code or slug already exists');
    }
  }

  private async attachFeaturedMedia(
    programs: ProgramsEntity[],
  ): Promise<ProgramsEntity[]> {
    const featuredMediaIds = [
      ...new Set(
        programs
          .map((program) => program.featuredMediaId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    if (featuredMediaIds.length === 0) {
      programs.forEach((program) => (program.featuredMedia = null));
      return programs;
    }

    const media = await this.mediaRepository.findBy({
      id: In(featuredMediaIds),
      targetType: MediaTargetType.PROGRAM,
      mediaType: MediaType.IMAGE,
    });
    const mediaById = new Map(media.map((item) => [item.id, item]));
    programs.forEach((program) => {
      const featuredMedia = program.featuredMediaId
        ? mediaById.get(program.featuredMediaId) ?? null
        : null;
      program.featuredMedia =
        featuredMedia?.targetId === program.id ? featuredMedia : null;
    });
    return programs;
  }

  private async findFeaturedProgramImage(
    manager: EntityManager,
    programId: string,
    mediaId: string,
  ): Promise<MediaEntity> {
    const media = await manager.getRepository(MediaEntity).findOneBy({
      id: mediaId,
      targetType: MediaTargetType.PROGRAM,
      targetId: programId,
      mediaType: MediaType.IMAGE,
    });
    if (!media) {
      throw new BadRequestException(
        'The program image must be an image attached to this program',
      );
    }
    return media;
  }

  private toSlug(value: string): string {
    const slug = value
      .trim()
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    if (!slug) throw new ConflictException('Program slug cannot be empty');
    return slug;
  }

  private cleanOptionalText(value?: string): string | null {
    const cleaned = value?.trim();
    return cleaned ? cleaned : null;
  }
}
