import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { InvitationStatus } from '../../../common/enums/invitation-status.enum';

export class UpdateInvitationStatusDto {
  @ApiProperty({ enum: InvitationStatus })
  @IsEnum(InvitationStatus)
  status!: InvitationStatus;
}
