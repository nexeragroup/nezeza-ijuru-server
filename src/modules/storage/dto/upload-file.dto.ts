import { IsEnum } from 'class-validator';
import { FileType } from '../enums/file-type.enum';

export class UploadFileDto {
  @IsEnum(FileType)
  fileType!: FileType;
}
