import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { AttendeeType } from '../../../common/enums/attendee-type.enum';

export class PublicRegistrationDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @Matches(/^\+?[0-9 ()-]{7,30}$/)
  phone!: string;

  @IsEnum(AttendeeType)
  targetType!: AttendeeType;

  @IsUUID()
  targetId!: string;
}
