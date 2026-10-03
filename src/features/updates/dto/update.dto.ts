import { PartialType } from '@nestjs/mapped-types';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PublicationStatus } from '../../../common/enums/publication-status.enum';
import { UpdateCategory } from '../entity/update.entity';

export class CreateUpdateDto {
  @IsString() @IsNotEmpty() @MaxLength(160) title!: string;
  @IsString() @IsNotEmpty() @MaxLength(600) message!: string;
  @IsEnum(UpdateCategory) category!: UpdateCategory;
  @IsOptional() @IsString() @MaxLength(40) label?: string | null;
  @IsOptional() @IsDateString() visibleFrom?: string | null;
  @IsOptional() @IsDateString() visibleUntil?: string | null;
  @IsOptional() @IsInt() @Min(0) @Max(100) priority?: number;
  @IsOptional() @IsString() @MaxLength(50) actionLabel?: string | null;
  @IsOptional() @IsString() @MaxLength(2000) actionUrl?: string | null;
  @IsOptional() @IsUUID() conferenceId?: string | null;
  @IsOptional() @IsUUID() eventId?: string | null;
  @IsOptional() @IsUUID() sessionId?: string | null;
}
export class EditUpdateDto extends PartialType(CreateUpdateDto) {
  @IsInt() @Min(1) version!: number;
}
export class PublishUpdateDto {
  @IsEnum(PublicationStatus) publicationStatus!: PublicationStatus;
  @IsInt() @Min(1) version!: number;
}
