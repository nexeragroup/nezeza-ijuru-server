import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

import { PERMISSION_NAME_PATTERN } from '../../../common/constants/permission.constants';

export class NewPermission {
  @IsString()
  @MinLength(3)
  @MaxLength(100)
  @Matches(PERMISSION_NAME_PATTERN, {
    message:
      'Permission name must use lowercase dot notation such as users.read',
  })
  name!: string;
}

export class UpdatePermission {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(100)
  @Matches(PERMISSION_NAME_PATTERN, {
    message:
      'Permission name must use lowercase dot notation such as users.read',
  })
  name?: string;
}
