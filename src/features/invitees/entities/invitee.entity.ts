import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { InvitationsEntity } from '../../invitations/entities/invitation.entity';
import { InviteeTitle } from '../../../common/enums/invitee-title.enum';
import { InviteeType } from '../../../common/enums/invitee-type.enum';

@Entity({ name: 'invitees', schema: 'public' })
export class InviteesEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'enum', enum: InviteeType })
  inviteetype!: InviteeType;
  @Column({ length: 180 })
  displayName!: string;
  @Column({ default: true })
  active!: boolean;
  @Column({ type: 'enum', enum: InviteeTitle, nullable: true })
  title!: InviteeTitle | null;
  @Column({ type: 'varchar', length: 80, nullable: true })
  customTitle!: string | null;
  @Column({ type: 'varchar', length: 255, nullable: true })
  name!: string | null;
  @Column({ type: 'varchar', length: 100, nullable: true })
  firstName!: string | null;
  @Column({ type: 'varchar', length: 100, nullable: true })
  lastName!: string | null;
  @Column({ type: 'varchar', length: 200, nullable: true })
  slug!: string | null;
  @Column({ type: 'text', nullable: true })
  description!: string | null;
  @Column({ type: 'text', nullable: true })
  bio!: string | null;
  @Column({ type: 'text', nullable: true })
  biography!: string | null;
  @Column({
    type: 'varchar',
    length: 180,
    nullable: true,
  })
  organization!: string | null;
  @Column({
    type: 'varchar',
    length: 180,
    nullable: true,
  })
  contactPerson!: string | null;
  @Column({ type: 'varchar', length: 180, nullable: true })
  email!: string | null;
  @Column({ type: 'varchar', length: 40, nullable: true })
  phone!: string | null;
  @Column({
    type: 'varchar',
    length: 180,
    nullable: true,
  })
  publicEmail!: string | null;
  @Column({ type: 'varchar', length: 40, nullable: true })
  publicPhone!: string | null;
  @Column({ type: 'varchar', length: 100, nullable: true })
  country!: string | null;
  @Column({ type: 'varchar', length: 100, nullable: true })
  city!: string | null;
  @Column({ type: 'varchar', length: 500, nullable: true })
  website!: string | null;
  @Column({ type: 'jsonb', nullable: true })
  social!: Record<string, string> | null;
  @Column({ type: 'uuid', nullable: true })
  media!: string | null;
  @Column({ name: 'logo_media_id', type: 'uuid', nullable: true })
  logo!: string | null;
  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date | null;
  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date | null;

  @OneToMany(() => InvitationsEntity, (invitation) => invitation.invitee)
  invitations!: InvitationsEntity[];
}
