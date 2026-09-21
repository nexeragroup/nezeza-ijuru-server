import { InvitationRolesEntity } from '../entities/invitation-role.entity';
import { InvitationsEntity } from '../entities/invitation.entity';

export class InvitationResponseDto {
  id!: string;
  reference!: string;
  invitee!: { id: string; displayName: string; inviteeType: string };
  event!: { id: string; title: string };
  session!: { id: string; title: string } | null;
  scope!: string;
  status!: string;
  attendanceStatus!: string;
  invitedAt!: Date | null;
  expectedArrivalAt!: Date | null;
  expectedDepartureAt!: Date | null;
  confirmedAt!: Date | null;
  declinedAt!: Date | null;
  cancelledAt!: Date | null;
  respondedAt!: Date | null;
  checkedInAt!: Date | null;
  numberOfPeople!: number | null;
  accommodationRequired!: boolean;
  transportRequired!: boolean;
  specialRequirements!: string | null;
  publicNotes!: string | null;
  isFeatured!: boolean;
  publicationStatus!: string;
  roles!: Array<{
    role: string;
    roleLabel: string | null;
    isPrimary: boolean;
  }>;
  createdAt!: Date;
  updatedAt!: Date;
  version!: number;

  static fromEntity(entity: InvitationsEntity): InvitationResponseDto {
    const response = new InvitationResponseDto();
    Object.assign(response, {
      id: entity.id,
      reference: entity.reference,
      invitee: {
        id: entity.invitee.id,
        displayName: entity.invitee.displayName,
        inviteeType: entity.invitee.inviteetype,
      },
      event: { id: entity.event.id, title: entity.event.title },
      session: entity.session
        ? { id: entity.session.id, title: entity.session.title }
        : null,
      scope: entity.scope,
      status: entity.status,
      attendanceStatus: entity.attendanceStatus,
      invitedAt: entity.invitedAt,
      expectedArrivalAt: entity.expectedArrivalAt,
      expectedDepartureAt: entity.expectedDepartureAt,
      confirmedAt: entity.confirmedAt,
      declinedAt: entity.declinedAt,
      cancelledAt: entity.cancelledAt,
      respondedAt: entity.respondedAt,
      checkedInAt: entity.checkedInAt,
      numberOfPeople: entity.numberOfPeople,
      accommodationRequired: entity.accommodationRequired,
      transportRequired: entity.transportRequired,
      specialRequirements: entity.specialRequirements,
      publicNotes: entity.publicNotes,
      isFeatured: entity.isFeatured,
      publicationStatus: entity.publicationStatus,
      roles: entity.roles.map((role) => InvitationResponseDto.mapRole(role)),
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    });
    return response;
  }

  private static mapRole(role: InvitationRolesEntity) {
    return {
      role: role.role,
      roleLabel: role.roleLabel,
      isPrimary: role.isPrimary,
    };
  }
}
