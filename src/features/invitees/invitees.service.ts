import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InviteeTitle } from '../../common/enums/invitee-title.enum';
import {
  PaginatedResponse,
  normalizePagination,
  toPaginatedResponse,
} from '../../common/utils/pagination.util';
import { InvitationsEntity } from '../invitations/entities/invitation.entity';
import { InviteeQueryDto } from './dto/invitee-query.dto';
import { InviteeResponseDto } from './dto/invitee-response.dto';
import { CreateInviteeDto, UpdateInviteeDto } from './dto/invitee.dto';
import { InviteesEntity } from './entities/invitee.entity';
import { DatabaseErrorService } from '../../common/services/database-error.service';

@Injectable()
export class InviteesService {
  constructor(
    @InjectRepository(InviteesEntity)
    private readonly inviteesRepository: Repository<InviteesEntity>,
    @InjectRepository(InvitationsEntity)
    private readonly invitationsRepository: Repository<InvitationsEntity>,
    private readonly databaseErrors: DatabaseErrorService,
  ) {}

  async create(dto: CreateInviteeDto): Promise<InviteeResponseDto> {
    this.validateTitle(dto.title, dto.customTitle);
    const entity = this.inviteesRepository.create(
      this.toPersistence(dto) as Partial<InviteesEntity>,
    );
    try {
      return InviteeResponseDto.fromEntity(
        await this.inviteesRepository.save(entity),
      );
    } catch (error) {
      this.databaseErrors.rethrow('create invitee', error, {
        duplicateMessage: 'An active invitee already uses this slug or email',
        context: InviteesService.name,
      });
    }
  }

  async findAll(query: InviteeQueryDto): Promise<PaginatedResponse<InviteeResponseDto>> {
    const pagination = normalizePagination(query);
    const builder = this.inviteesRepository.createQueryBuilder('invitee');
    if (query.search?.trim()) {
      builder.andWhere(
        `(invitee.displayname ILIKE :search OR invitee.name ILIKE :search OR invitee.organization ILIKE :search)`,
        { search: `%${query.search.trim()}%` },
      );
    }
    if (query.inviteeType)
      builder.andWhere('invitee.inviteetype = :inviteeType', {
        inviteeType: query.inviteeType,
      });
    if (query.active !== undefined)
      builder.andWhere('invitee.active = :active', { active: query.active });
    if (query.country)
      builder.andWhere('LOWER(invitee.country) = LOWER(:country)', {
        country: query.country.trim(),
      });
    if (query.city)
      builder.andWhere('LOWER(invitee.city) = LOWER(:city)', {
        city: query.city.trim(),
      });
    const sortFields: Record<string, string> = {
      displayName: 'invitee.displayname',
      inviteeType: 'invitee.inviteetype',
      country: 'invitee.country',
      city: 'invitee.city',
      createdAt: 'invitee.createdAt',
      updatedAt: 'invitee.updatedAt',
    };
    const sort = sortFields[query.sortBy ?? 'createdAt'];
    if (!sort) throw new BadRequestException('Unsupported invitee sort field');
    const result = await builder
      .orderBy(sort, query.sortOrder)
      .skip(pagination.skip)
      .take(pagination.take)
      .getManyAndCount();
    return toPaginatedResponse(
      [
        result[0].map((entity) => InviteeResponseDto.fromEntity(entity)),
        result[1],
      ],
      pagination,
    );
  }

  async findById(id: string, withDeleted = false): Promise<InviteesEntity> {
    const entity = await this.inviteesRepository.findOne({
      where: { id },
      withDeleted,
    });
    if (!entity) throw new NotFoundException(`Invitee with ID ${id} not found`);
    return entity;
  }

  async findOne(id: string): Promise<InviteeResponseDto> {
    return InviteeResponseDto.fromEntity(await this.findById(id));
  }

  async update(id: string, dto: UpdateInviteeDto): Promise<InviteeResponseDto> {
    const entity = await this.findById(id);
    this.validateTitle(
      dto.title ?? entity.title ?? undefined,
      dto.customTitle ?? entity.customTitle ?? undefined,
    );
    Object.assign(entity, this.toPersistence(dto));
    try {
      return InviteeResponseDto.fromEntity(
        await this.inviteesRepository.save(entity),
      );
    } catch (error) {
      this.databaseErrors.rethrow('update invitee', error, {
        duplicateMessage: 'An active invitee already uses this slug or email',
        context: InviteesService.name,
      });
    }
  }

  async remove(id: string): Promise<void> {
    await this.findById(id);
    if (await this.invitationsRepository.existsBy({ inviteeId: id })) {
      throw new ConflictException(
        'Invitee cannot be archived while active invitations exist',
      );
    }
    await this.inviteesRepository.softDelete(id);
  }

  async restore(id: string): Promise<InviteeResponseDto> {
    await this.findById(id, true);
    try {
      await this.inviteesRepository.restore(id);
      return this.findOne(id);
    } catch (error) {
      this.databaseErrors.rethrow('restore invitee', error, {
        duplicateMessage:
          'Invitee cannot be restored because its slug or email is already used',
        context: InviteesService.name,
      });
    }
  }

  private validateTitle(title?: InviteeTitle, customTitle?: string): void {
    if (title === InviteeTitle.OTHER && !customTitle?.trim()) {
      throw new BadRequestException(
        'customTitle is required when title is OTHER',
      );
    }
  }

  private toPersistence(
    dto: CreateInviteeDto | UpdateInviteeDto,
  ): Record<string, unknown> {
    const result: Record<string, unknown> = { ...dto };
    if (dto.inviteeType !== undefined) {
      result.inviteetype = dto.inviteeType;
      delete result.inviteeType;
    }
    if (dto.displayName !== undefined) {
      result.displayname = dto.displayName.trim();
      delete result.displayName;
    }
    if (dto.firstName !== undefined || dto.lastName !== undefined) {
      result.name = [dto.firstName, dto.lastName]
        .filter((value): value is string => Boolean(value?.trim()))
        .join(' ');
    }
    const renamedFields: Record<string, string> = {
      shortBio: 'bio',
      organizationName: 'organization',
      contactPersonName: 'contactPerson',
      websiteUrl: 'website',
      socialLinks: 'social',
      profileMediaId: 'media',
      logoMediaId: 'logo',
    };
    for (const [source, target] of Object.entries(renamedFields)) {
      if (result[source] !== undefined) result[target] = result[source];
      delete result[source];
    }
    const textFields = [
      'displayname',
      'customTitle',
      'name',
      'firstName',
      'lastName',
      'slug',
      'description',
      'bio',
      'biography',
      'organization',
      'contactPerson',
      'phone',
      'publicPhone',
      'country',
      'city',
      'notes',
    ];
    for (const field of textFields) {
      const value = result[field];
      if (typeof value === 'string') result[field] = value.trim() || null;
    }
    for (const field of ['email', 'publicEmail']) {
      const value = result[field];
      if (typeof value === 'string')
        result[field] = value.trim().toLowerCase() || null;
    }
    return result;
  }
}
