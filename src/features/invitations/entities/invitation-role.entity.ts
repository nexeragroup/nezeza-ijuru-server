import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { InvitationRole } from '../../../common/enums/invitation-role.enum';
import { InvitationsEntity } from './invitation.entity';

@Entity({ name: 'invitation_roles', schema: 'public' })
export class InvitationRolesEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;
  @Column({ type: 'enum', enum: InvitationRole })
  role!: InvitationRole;
  @Column({ type: 'varchar', length: 150, nullable: true })
  roleLabel!: string | null;
  @Column({ default: false })
  isPrimary!: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date | null;
  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date | null;

  @Column({ type: 'uuid' })
  invitationId!: string;
  @ManyToOne(() => InvitationsEntity, (invitation) => invitation.roles, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'invitationId' })
  invitation!: InvitationsEntity;
}
