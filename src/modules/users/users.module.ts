import { TypeOrmModule } from '@nestjs/typeorm';
import { CommonModule } from '../../common/common.module';
import { UsersEntity } from './entity/users.entity';
import { RolesEntity } from '../roles/entity/roles.entity';
import { PermissionsEntity } from '../permissions/entity/permissions.entity';
import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { AuthTokenEntity } from '../auth/entity/auth-token.entity';
import { RolesModule } from '../roles/roles.module';
import { MailsModule } from '../mails/mails.module';
@Module({
  imports: [
    CommonModule,
    RolesModule,
    MailsModule,
    TypeOrmModule.forFeature([
      UsersEntity,
      RolesEntity,
      PermissionsEntity,
      AuthTokenEntity,
    ]),
  ],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
