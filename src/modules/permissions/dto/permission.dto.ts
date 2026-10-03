import { Transform } from 'class-transformer';

import {
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

import { ApiProperty, PartialType } from '@nestjs/swagger';
import { PERMISSION_NAME_PATTERN } from '../../../common/constants/permission.constants';

export class NewPermission {
  @ApiProperty({
    example: 'storage.upload',
    description:
      'Canonical permission identifier using dot-separated lowercase segments.',
    maxLength: 100,
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(100)
  @Matches(PERMISSION_NAME_PATTERN, {
    message:
      'Permission name must use lowercase dot notation such as storage.upload',
  })
  name!: string;
}

export class UpdatePermission extends PartialType(NewPermission) {}
