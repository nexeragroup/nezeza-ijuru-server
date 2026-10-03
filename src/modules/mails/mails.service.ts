import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, EntityManager } from 'typeorm';
import { OutboxService } from '../../common/services/outbox.service';
import type {
  AccountCreationMail,
  MailMessage,
  MailQueuedResult,
  ReportConfirmationMail,
  SecurityMailPurpose,
} from './interfaces/mail.interface';
import { SecretProtectionService } from '../../common/services/secret-protection.service';

const MAIL_EVENT_TYPE = 'mail.send';
const MAIL_SCHEMA_VERSION = 1;
const MAX_EMAIL_LENGTH = 254;
const MAX_SUBJECT_LENGTH = 255;
const MAX_MAIL_BODY_LENGTH = 100_000;
const MAX_NAME_LENGTH = 150;
const MAX_URL_LENGTH = 2_048;

@Injectable()
export class MailsService {
  private readonly logger = new Logger(MailsService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly outboxService: OutboxService,
    private readonly secrets: SecretProtectionService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Queues an email through the transactional outbox.
   *
   * This method never performs network-based mail delivery.
   */
  async sendMail(
    to: string,
    subject: string,
    text = subject,
    manager?: EntityManager,
  ): Promise<MailQueuedResult> {
    this.assertMailPipelineAvailable();

    const message = this.normalizeMailMessage({
      to,
      subject,
      text,
    });

    const addEvent = async (transaction: EntityManager) => {
      const encryptedPayload = this.secrets.encrypt(JSON.stringify(message));

      return this.outboxService.add(transaction, {
        eventType: MAIL_EVENT_TYPE,

        schemaVersion: MAIL_SCHEMA_VERSION,

        payload: {
          encrypted: encryptedPayload,
        },
      });
    };

    const event = manager
      ? await addEvent(manager)
      : await this.dataSource.transaction(addEvent);

    return {
      queued: true,

      eventId: event.eventId,
    };
  }

  /**
   * Queues an authentication/security lifecycle email.
   *
   * Security-token delivery is considered critical. If the mail
   * pipeline is unavailable, the calling transaction should fail
   * rather than committing an unusable verification/reset token.
   */
  async sendSecurityToken(
    to: string,
    firstName: string,
    token: string,
    purpose: SecurityMailPurpose,
    manager?: EntityManager,
  ): Promise<MailQueuedResult> {
    const normalizedName = this.normalizeName(firstName);

    const normalizedToken = this.normalizeSecurityToken(token);

    switch (purpose) {
      case 'EMAIL_VERIFICATION':
        return this.sendMail(
          to,

          'Verify your email address',

          [
            `Hello ${normalizedName},`,
            '',
            'Use the following security token to verify your email address:',
            '',
            normalizedToken,
            '',
            'If you did not request this verification, you can ignore this message.',
          ].join('\n'),

          manager,
        );

      case 'PASSWORD_RESET':
        return this.sendMail(
          to,

          'Reset your password',

          [
            `Hello ${normalizedName},`,
            '',
            'Use the following security token to reset your password:',
            '',
            normalizedToken,
            '',
            'If you did not request a password reset, you can ignore this message.',
          ].join('\n'),

          manager,
        );
    }
  }

  /**
   * Sends a notification that an account has been locked.
   *
   * Unlike security-token delivery, this notification is
   * best-effort. Mail infrastructure failure must not change
   * authentication behavior or turn an invalid login into a 503.
   */
  async sendAccountLocked(to: string, firstName: string): Promise<void> {
    const name = this.normalizeName(firstName);

    try {
      await this.sendMail(
        to,

        'Account locked',

        [
          `Hello ${name},`,
          '',
          'Your account was locked after multiple unsuccessful login attempts.',
          '',
          'If you did not attempt to sign in, contact your system administrator.',
        ].join('\n'),
      );
    } catch (error) {
      /*
       * Never log email addresses, tokens, or complete payloads.
       */
      this.logger.warn(
        error instanceof Error
          ? `Failed to queue account-lock notification: ${error.message}`
          : 'Failed to queue account-lock notification',
      );
    }
  }

  /**
   * Sends a notification after an administrator creates an account.
   */
  async sendAccountCreation(
    details: AccountCreationMail,
    manager?: EntityManager,
  ): Promise<MailQueuedResult> {
    const recipientName = this.normalizeName(details.recipientName);

    const accountEmail = this.normalizeEmail(details.accountEmail);

    const roles = this.normalizeRoles(details.roles);

    const createdAt = details.createdAt ?? new Date();

    const lines = [
      `Hello ${recipientName},`,
      '',
      'Your account has been created successfully.',
      '',
      `Email: ${accountEmail}`,
      `Roles: ${roles.join(', ') || 'None'}`,
      `Created: ${createdAt.toISOString()}`,
    ];

    if (details.loginUrl) {
      lines.push('', `Sign in: ${this.normalizeUrl(details.loginUrl)}`);
    }

    lines.push(
      '',
      'If you were not expecting this account, contact your system administrator.',
    );

    return this.sendMail(
      details.recipientEmail,

      'Your account has been created',

      lines.join('\n'),

      manager,
    );
  }

  /**
   * Sends confirmation that a report has been recorded.
   */
  async sendReportConfirmation(
    details: ReportConfirmationMail,
    manager?: EntityManager,
  ): Promise<MailQueuedResult> {
    const recipientName = this.normalizeName(details.recipientName);

    const reportName = this.normalizeText(
      details.reportName,
      255,
      'reportName',
    );

    const reportId = this.normalizeText(details.reportId, 255, 'reportId');

    const submittedBy = this.normalizeText(
      details.submittedBy,
      255,
      'submittedBy',
    );

    const department = this.normalizeText(
      details.department,
      255,
      'department',
    );

    const savedAt = details.savedAt ?? new Date();

    return this.sendMail(
      details.recipientEmail,

      'Report submitted successfully',

      [
        `Hello ${recipientName},`,
        '',
        'Your report has been saved successfully.',
        '',
        `Report: ${reportName}`,
        `Report ID: ${reportId}`,
        `Submitted by: ${submittedBy}`,
        `Department: ${department}`,
        `Saved at: ${savedAt.toISOString()}`,
      ].join('\n'),

      manager,
    );
  }

  /**
   * Determines whether mail can be durably staged and delivered.
   */
  private assertMailPipelineAvailable(): void {
    const outboxEnabled = this.config.get<boolean>('outbox.enabled', true);

    const queueEnabled = this.config.get<boolean>('queue.enabled', true);

    if (!outboxEnabled || !queueEnabled) {
      throw new ServiceUnavailableException({
        code: 'MAIL_DELIVERY_UNAVAILABLE',

        message: 'Mail delivery is currently unavailable',
      });
    }
  }

  private normalizeMailMessage(input: MailMessage): MailMessage {
    return {
      to: this.normalizeEmail(input.to),

      subject: this.normalizeSubject(input.subject),

      text: this.normalizeMailBody(input.text),
    };
  }

  private normalizeEmail(value: string): string {
    if (typeof value !== 'string') {
      throw new TypeError('Email must be a string');
    }

    const normalized = value.trim().toLowerCase();

    /*
     * DTOs remain responsible for complete RFC-style validation.
     * This internal boundary still performs basic defensive checks.
     */
    if (
      !normalized ||
      normalized.length > MAX_EMAIL_LENGTH ||
      normalized.includes('\r') ||
      normalized.includes('\n') ||
      !normalized.includes('@')
    ) {
      throw new TypeError('Invalid email address');
    }

    return normalized;
  }

  private normalizeSubject(value: string): string {
    if (typeof value !== 'string') {
      throw new TypeError('Mail subject must be a string');
    }

    const normalized = value.trim();

    /*
     * Reject CR/LF rather than merely stripping them. This prevents
     * header-injection behavior if a future mail transport uses the
     * value directly.
     */
    if (
      !normalized ||
      normalized.length > MAX_SUBJECT_LENGTH ||
      /[\r\n]/.test(normalized)
    ) {
      throw new TypeError('Invalid mail subject');
    }

    return normalized;
  }

  private normalizeMailBody(value: string): string {
    if (typeof value !== 'string') {
      throw new TypeError('Mail body must be a string');
    }

    if (!value || value.length > MAX_MAIL_BODY_LENGTH) {
      throw new TypeError('Invalid mail body');
    }

    return value;
  }

  private normalizeName(value: string): string {
    return this.normalizeText(value, MAX_NAME_LENGTH, 'name');
  }

  private normalizeText(
    value: string,
    maxLength: number,
    field: string,
  ): string {
    if (typeof value !== 'string') {
      throw new TypeError(`${field} must be a string`);
    }

    const normalized = value.trim().replace(/\s+/g, ' ');

    if (!normalized || normalized.length > maxLength) {
      throw new TypeError(`Invalid ${field}`);
    }

    return normalized;
  }

  private normalizeSecurityToken(value: string): string {
    if (
      typeof value !== 'string' ||
      !value ||
      value.length > 4_096 ||
      value.trim() !== value ||
      /[\r\n]/.test(value)
    ) {
      throw new TypeError('Invalid security token');
    }

    return value;
  }

  private normalizeRoles(values: readonly string[]): string[] {
    if (!Array.isArray(values) || values.length > 100) {
      throw new TypeError('Invalid roles');
    }

    return [
      ...new Set(values.map((role) => this.normalizeText(role, 100, 'role'))),
    ].sort();
  }

  private normalizeUrl(value: string): string {
    if (typeof value !== 'string' || value.length > MAX_URL_LENGTH) {
      throw new TypeError('Invalid URL');
    }

    const url = new URL(value);

    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      throw new TypeError('Invalid URL protocol');
    }

    return url.toString();
  }
}
