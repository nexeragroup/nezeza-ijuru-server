import { registerAs } from '@nestjs/config';

const splitEmails = (value: string | undefined): string[] =>
  (value ?? '')
    .split(',')
    .map((email) => email.trim())
    .filter(Boolean);

export default registerAs('inquiry', () => ({
  receiverEmail:
    process.env.INQUIRY_RECEIVER_EMAIL || process.env.MAIL_FROM || '',
  ccEmails: splitEmails(process.env.INQUIRY_CC_EMAILS),
  subjectPrefix: process.env.INQUIRY_SUBJECT_PREFIX?.trim() || 'Nezeza Ijuru',
}));
