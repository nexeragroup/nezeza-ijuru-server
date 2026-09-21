export interface GoogleUser {
  readonly provider: 'google';
  readonly providerId: string;
  readonly email: string;
  readonly emailVerified: true;
  readonly firstName: string | null;
  readonly lastName: string | null;
  readonly picture: string | null;
}
