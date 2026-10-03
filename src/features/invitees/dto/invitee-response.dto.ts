import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { InviteesEntity } from '../entities/invitee.entity';
import { InviteeTitle } from '../../../common/enums/invitee-title.enum';
import { InviteeType } from '../../../common/enums/invitee-type.enum';

export class InviteeResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: InviteeType }) inviteeType!: InviteeType;
  @ApiProperty() displayName!: string;
  @ApiProperty() active!: boolean;
  @ApiPropertyOptional({ enum: InviteeTitle }) title!: InviteeTitle | null;
  @ApiPropertyOptional() customTitle!: string | null;
  @ApiPropertyOptional() firstName!: string | null;
  @ApiPropertyOptional() lastName!: string | null;
  @ApiPropertyOptional() slug!: string | null;
  @ApiPropertyOptional() description!: string | null;
  @ApiPropertyOptional() shortBio!: string | null;
  @ApiPropertyOptional() biography!: string | null;
  @ApiPropertyOptional() organizationName!: string | null;
  @ApiPropertyOptional() contactPersonName!: string | null;
  @ApiPropertyOptional() email!: string | null;
  @ApiPropertyOptional() phone!: string | null;
  @ApiPropertyOptional() publicEmail!: string | null;
  @ApiPropertyOptional() publicPhone!: string | null;
  @ApiPropertyOptional() country!: string | null;
  @ApiPropertyOptional() city!: string | null;
  @ApiPropertyOptional() websiteUrl!: string | null;
  @ApiPropertyOptional() socialLinks!: Record<string, string> | null;
  @ApiPropertyOptional() profileMediaId!: string | null;
  @ApiPropertyOptional() logoMediaId!: string | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;

  static fromEntity(entity: InviteesEntity): InviteeResponseDto {
    const response = new InviteeResponseDto();
    Object.assign(response, {
      id: entity.id,
      inviteeType: entity.inviteetype,
      displayName: entity.displayName,
      active: entity.active,
      title: entity.title,
      customTitle: entity.customTitle,
      firstName: entity.firstName,
      lastName: entity.lastName,
      slug: entity.slug,
      description: entity.description,
      shortBio: entity.bio,
      biography: entity.biography,
      organizationName: entity.organization,
      contactPersonName: entity.contactPerson,
      email: entity.email,
      phone: entity.phone,
      publicEmail: entity.publicEmail,
      publicPhone: entity.publicPhone,
      country: entity.country,
      city: entity.city,
      websiteUrl: entity.website,
      socialLinks: entity.social,
      profileMediaId: entity.media,
      logoMediaId: entity.logo,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    });
    return response;
  }
}
