import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { InvitationAttendanceStatus } from '../../../common/enums/invitation-attendance-status.enum';

export class RecordInvitationAttendanceDto {
  @ApiProperty({ enum: InvitationAttendanceStatus })
  @IsEnum(InvitationAttendanceStatus)
  attendanceStatus!: InvitationAttendanceStatus;
}
