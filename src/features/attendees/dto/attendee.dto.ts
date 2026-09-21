import { OmitType, PartialType } from '@nestjs/mapped-types';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { AttendeeStatus } from '../../../common/enums/attendee-status.enum';
import { AttendeeType } from '../../../common/enums/attendee-type.enum';

export class NewAttendee {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  lastName!: string;

  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  organization?: string;

  @IsEnum(AttendeeType)
  attendeeType!: AttendeeType;

  @IsOptional()
  @IsUUID()
  eventId?: string;

  @IsOptional()
  @IsUUID()
  sessionId?: string;

  @IsOptional()
  @IsEnum(AttendeeStatus)
  status?: AttendeeStatus;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateAttendee extends PartialType(
  OmitType(NewAttendee, ['attendeeType', 'eventId', 'sessionId'] as const),
) {}

export class CheckInAttendee {
  @IsBoolean()
  checkedIn!: boolean;
}
