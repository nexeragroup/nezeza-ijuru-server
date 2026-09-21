import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NewVenue, UpdateVenue } from './dto/venue.dto';
import { VenuesEntity } from './entity/venues.entity';

@Injectable()
export class VenuesService {
  constructor(
    @InjectRepository(VenuesEntity)
    private readonly venuesRepository: Repository<VenuesEntity>,
  ) {}

  createVenue(dto: NewVenue): Promise<VenuesEntity> {
    const venue = new VenuesEntity();
    venue.name = dto.name.trim();
    venue.address = this.cleanOptionalText(dto.address);
    venue.city = this.cleanOptionalText(dto.city);
    venue.active = dto.active ?? true;
    venue.district = this.cleanOptionalText(dto.district);
    venue.country = dto.country?.trim() || 'Rwanda';
    venue.latitude = dto.latitude === undefined ? null : String(dto.latitude);
    venue.longitude =
      dto.longitude === undefined ? null : String(dto.longitude);
    venue.map = this.cleanOptionalText(dto.mapUrl);
    venue.capacity = dto.capacity ?? null;
    venue.phone = this.cleanOptionalText(dto.contactPhone);
    venue.email =
      this.cleanOptionalText(dto.contactEmail)?.toLowerCase() ?? null;
    venue.instructions = this.cleanOptionalText(dto.arrivalInstructions);
    venue.website = this.cleanOptionalText(dto.websiteUrl);
    return this.venuesRepository.save(venue);
  }

  findAllVenues(): Promise<VenuesEntity[]> {
    return this.venuesRepository.find({
      relations: { events: true, sessions: true },
      order: { active: 'DESC', name: 'ASC' },
    });
  }

  async findVenueByID(id: string, withDeleted = false): Promise<VenuesEntity> {
    const venue = await this.venuesRepository.findOne({
      where: { id },
      withDeleted,
      relations: { events: true, sessions: true },
    });
    if (!venue) throw new NotFoundException(`Venue with ID ${id} not found`);
    return venue;
  }

  async updateVenue(id: string, dto: UpdateVenue): Promise<VenuesEntity> {
    const venue = await this.findVenueByID(id);
    Object.assign(venue, {
      ...dto,
      ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
      ...(dto.address !== undefined
        ? { address: this.cleanOptionalText(dto.address) }
        : {}),
      ...(dto.city !== undefined
        ? { city: this.cleanOptionalText(dto.city) }
        : {}),
      ...(dto.district !== undefined
        ? { district: this.cleanOptionalText(dto.district) }
        : {}),
      ...(dto.country !== undefined ? { country: dto.country.trim() } : {}),
      ...(dto.latitude !== undefined ? { latitude: String(dto.latitude) } : {}),
      ...(dto.longitude !== undefined
        ? { longitude: String(dto.longitude) }
        : {}),
      ...(dto.mapUrl !== undefined
        ? { map: this.cleanOptionalText(dto.mapUrl) }
        : {}),
      ...(dto.contactPhone !== undefined
        ? { phone: this.cleanOptionalText(dto.contactPhone) }
        : {}),
      ...(dto.contactEmail !== undefined
        ? {
            email:
              this.cleanOptionalText(dto.contactEmail)?.toLowerCase() ?? null,
          }
        : {}),
      ...(dto.arrivalInstructions !== undefined
        ? {
            instructions: this.cleanOptionalText(dto.arrivalInstructions),
          }
        : {}),
      ...(dto.websiteUrl !== undefined
        ? { website: this.cleanOptionalText(dto.websiteUrl) }
        : {}),
    });
    return this.venuesRepository.save(venue);
  }

  async softDeleteVenue(id: string): Promise<void> {
    await this.findVenueByID(id);
    await this.venuesRepository.softDelete(id);
  }

  async restoreVenue(id: string): Promise<VenuesEntity> {
    await this.findVenueByID(id, true);
    await this.venuesRepository.restore(id);
    return this.findVenueByID(id);
  }

  private cleanOptionalText(value?: string): string | null {
    const cleaned = value?.trim();
    return cleaned ? cleaned : null;
  }
}
