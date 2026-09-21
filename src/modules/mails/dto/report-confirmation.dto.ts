export interface ReportConfirmation {
  recipientName: string;
  recipientEmail: string;
  reportName: string;
  reportId: string;
  submittedBy: string;
  department: string;
  savedAt?: string; // Optional — defaults to now if not provided
}
