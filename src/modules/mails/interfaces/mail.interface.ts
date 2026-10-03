export type SecurityMailPurpose = 'EMAIL_VERIFICATION' | 'PASSWORD_RESET';

export interface MailMessage {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
}

export interface MailQueuedResult {
  readonly queued: true;
  readonly eventId: string;
}

export interface AccountCreationMail {
  /**
   * Destination email address.
   */
  readonly recipientEmail: string;

  /**
   * Name displayed in the email greeting.
   */
  readonly recipientName: string;

  /**
   * Account email/username information.
   */
  readonly accountEmail: string;

  /**
   * Assigned application roles.
   */
  readonly roles: readonly string[];
  readonly createdAt?: Date;
  readonly loginUrl?: string;
}

export interface ReportConfirmationMail {
  readonly recipientName: string;
  readonly recipientEmail: string;
  readonly reportName: string;
  readonly reportId: string;
  readonly submittedBy: string;
  readonly department: string;
  readonly savedAt?: Date;
}
