import {
  ApiProperty,
  ApiPropertyOptional,
  OmitType,
  PartialType,
} from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { InvitationScope } from '../../../common/enums/invitation-scope.enum';
import { PublicationStatus } from '../../../common/enums/publication-status.enum';
import { InvitationRoleDto } from './invitation-role.dto';

export class CreateInvitationDto {
  @ApiProperty() @IsUUID() inviteeId!: string;
  @ApiProperty() @IsUUID() eventId!: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() sessionId?: string;
  @ApiProperty({ enum: InvitationScope })
  @IsEnum(InvitationScope)
  scope!: InvitationScope;

  @ApiProperty({ type: [InvitationRoleDto] })
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => InvitationRoleDto)
  roles!: InvitationRoleDto[];

  @ApiPropertyOptional() @IsOptional() @IsString() invitationMessage?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  expectedArrivalAt?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  expectedDepartureAt?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  numberOfPeople?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  accommodationRequired?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() transportRequired?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() specialRequirements?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() internalNotes?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() publicNotes?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isFeatured?: boolean;
  @ApiPropertyOptional({ enum: PublicationStatus })
  @IsOptional()
  @IsEnum(PublicationStatus)
  publicationStatus?: PublicationStatus;
  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class UpdateInvitationDto extends PartialType(
  OmitType(CreateInvitationDto, [
    'inviteeId',
    'eventId',
    'sessionId',
    'scope',
  ] as const),
) {}
