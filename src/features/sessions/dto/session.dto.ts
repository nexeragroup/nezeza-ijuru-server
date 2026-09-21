import { PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { PublicationStatus } from '../../../common/enums/publication-status.enum';
import { SessionStatus } from '../../../common/enums/session-status.enum';

export class NewSession {
  @IsUUID()
  eventId!: string;

  @IsOptional()
  @IsUUID()
  venueId?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  code!: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  slug?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsDateString()
  startAt!: string;

  @IsDateString()
  endAt!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  capacity?: number;

  @IsOptional()
  @IsBoolean()
  registrationRequired?: boolean;

  @IsOptional()
  @IsDateString()
  registrationOpensAt?: string;

  @IsOptional()
  @IsDateString()
  registrationClosesAt?: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  streamUrl?: string;

  @IsOptional()
  @IsEnum(SessionStatus)
  sessionStatus?: SessionStatus;

  @IsOptional()
  @IsEnum(PublicationStatus)
  publicationStatus?: PublicationStatus;
}

export class UpdateSession extends PartialType(NewSession) {}
