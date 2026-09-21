import { PartialType } from '@nestjs/mapped-types';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { MediaTargetType, MediaType } from '../../../common/enums/media.enum';

const optionalText = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;

export class MediaMetadataDto {
  @IsEnum(MediaTargetType)
  targetType!: MediaTargetType;

  @IsUUID()
  targetId!: string;

  @IsEnum(MediaType)
  mediaType!: MediaType;

  @IsString()
  @MaxLength(180)
  title!: string;

  @IsOptional()
  @Transform(optionalText)
  @IsString()
  @MaxLength(2000)
  caption?: string;

  @IsOptional()
  @Transform(optionalText)
  @IsString()
  @MaxLength(500)
  altText?: string;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(0)
  durationSeconds?: number;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  isFeatured?: boolean;
}

export class NewExternalMediaDto extends MediaMetadataDto {
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  url!: string;
}

export class UpdateMediaDto extends PartialType(MediaMetadataDto) {}
