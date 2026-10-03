import { OmitType, PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import {
  IsBoolean,
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
  ValidateNested,
} from 'class-validator';
import { PublicationStatus } from '../../../common/enums/publication-status.enum';

export class ConferenceProgramDto {
  @IsUUID()
  programId!: string;

  @IsOptional()
  @IsString()
  conferenceSummary?: string;

  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;
}

export class NewConference {
  @IsInt()
  @Min(2017)
  @Max(2100)
  year!: number;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  slug?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(250)
  theme!: string;

  @IsOptional()
  @IsString()
  summary?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsBoolean()
  isCurrent?: boolean;

  @IsOptional()
  @IsEnum(PublicationStatus)
  publicationStatus?: PublicationStatus;

  @IsOptional()
  @IsUUID()
  featuredMediaId?: string;

  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => ConferenceProgramDto)
  programs: ConferenceProgramDto[] = [];
}

export class UpdateConference extends PartialType(
  OmitType(NewConference, ['programs'] as const),
) {}
