import { CommonModule } from '../../common/common.module';
import { Module } from '@nestjs/common';
import { MailsService } from './mails.service';
@Module({
  imports: [CommonModule],
  providers: [MailsService],
  exports: [MailsService],
})
export class MailsModule {}
