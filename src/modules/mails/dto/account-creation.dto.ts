export interface AccountCreation {
  /** Recipient */
  recipient: string;
  names: string;

  /** Account details */
  email: string;
  roles: string;

  /** Optional metadata */
  createdAt?: string;

  loginUrl?: string;
}
