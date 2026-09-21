import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { InvitationAttendanceStatus } from '../../../common/enums/invitation-attendance-status.enum';
import { InvitationRole } from '../../../common/enums/invitation-role.enum';
import { InvitationScope } from '../../../common/enums/invitation-scope.enum';
import { InvitationStatus } from '../../../common/enums/invitation-status.enum';
import { InviteeType } from '../../../common/enums/invitee-type.enum';
import { PublicationStatus } from '../../../common/enums/publication-status.enum';

export class InvitationQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() reference?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() inviteeId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() eventId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() sessionId?: string;
  @ApiPropertyOptional({ enum: InvitationScope })
  @IsOptional()
  @IsEnum(InvitationScope)
  scope?: InvitationScope;
  @ApiPropertyOptional({ enum: InvitationStatus })
  @IsOptional()
  @IsEnum(InvitationStatus)
  status?: InvitationStatus;
  @ApiPropertyOptional({ enum: InvitationAttendanceStatus })
  @IsOptional()
  @IsEnum(InvitationAttendanceStatus)
  attendanceStatus?: InvitationAttendanceStatus;
  @ApiPropertyOptional({ enum: InvitationRole })
  @IsOptional()
  @IsEnum(InvitationRole)
  role?: InvitationRole;
  @ApiPropertyOptional({ enum: InviteeType })
  @IsOptional()
  @IsEnum(InviteeType)
  inviteeType?: InviteeType;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  isFeatured?: boolean;
  @ApiPropertyOptional({ enum: PublicationStatus })
  @IsOptional()
  @IsEnum(PublicationStatus)
  publicationStatus?: PublicationStatus;
}
