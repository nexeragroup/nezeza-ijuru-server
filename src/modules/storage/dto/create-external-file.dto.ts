import {
  IsEnum,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';
import { FileType } from '../enums/file-type.enum';

export class CreateExternalFileDto {
  @IsEnum(FileType)
  fileType!: FileType;

  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  url!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  originalName?: string;
}
