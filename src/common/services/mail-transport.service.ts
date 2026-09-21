import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { Transporter } from 'nodemailer';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}
@Injectable()
export class MailTransportService implements OnModuleDestroy {
  private transport?: Transporter;
  constructor(private readonly config: ConfigService) {}
  async deliver(message: MailMessage, eventId: string) {
    if (!this.transport) {
      const host = this.config.get<string>('MAIL_HOST');
      if (!host) throw new Error('Mail transport is not configured');
      this.transport = nodemailer.createTransport({
        host,
        port: Number(this.config.get('MAIL_PORT', 587)),
        secure: String(this.config.get('MAIL_SECURE', 'false')) === 'true',
        auth: this.config.get<string>('MAIL_USER')
          ? {
              user: this.config.get<string>('MAIL_USER'),
              pass: this.config.get<string>('MAIL_PASS'),
            }
          : undefined,
        tls: {
          rejectUnauthorized:
            String(this.config.get('MAIL_TLS_REJECT_UNAUTHORIZED', 'true')) !==
            'false',
        },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 30000,
      });
    }
    try {
      const result = await this.transport.sendMail({
        ...message,
        from: this.config.getOrThrow<string>('MAIL_FROM'),
        messageId: `<${eventId}@security-mail.local>`,
      });
      if (result.rejected?.length) throw new Error('Mail rejected');
    } catch {
      throw new Error('Mail delivery failed');
    }
  }
  onModuleDestroy() {
    this.transport?.close();
  }
}
