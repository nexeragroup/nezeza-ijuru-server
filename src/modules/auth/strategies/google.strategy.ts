import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Profile, Strategy } from 'passport-google-oauth20';
import type { GoogleUser } from '../../../common/models/google-user.model';

interface GoogleProfileJson {
  email?: unknown;
  email_verified?: unknown;
}

interface GoogleProfileEmail {
  value?: string;
  verified?: boolean;
}

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(config: ConfigService) {
    super({
      clientID: config.getOrThrow<string>('google.clientId'),
      clientSecret: config.getOrThrow<string>('google.clientSecret'),
      callbackURL: config.getOrThrow<string>('google.callbackUrl'),
      scope: ['email', 'profile'],

      /*
       * Protect the OAuth authorization flow against
       * cross-site request forgery.
       *
       * Your application already has Express session
       * middleware available for OAuth state storage.
       */
      state: true,
    });
  }

  validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
  ): GoogleUser {
    const providerId = this.normalizeProviderId(profile.id);
    const profileJson = profile._json as GoogleProfileJson | undefined;
    const profileEmail = profile.emails?.[0] as GoogleProfileEmail | undefined;
    const email = this.normalizeEmail(
      profileEmail?.value ??
        (typeof profileJson?.email === 'string'
          ? profileJson.email
          : undefined),
    );

    const emailVerified =
      profileEmail?.verified === true || profileJson?.email_verified === true;
    /*
     * Never link/create a local account using an
     * unverified provider email.
     */
    if (!email || !emailVerified) {
      throw new UnauthorizedException({
        code: 'GOOGLE_EMAIL_NOT_VERIFIED',
        message: 'A verified Google email address is required',
      });
    }

    return {
      provider: 'google',
      providerId,
      email,
      emailVerified: true,
      firstName: this.normalizeOptionalName(profile.name?.givenName),
      lastName: this.normalizeOptionalName(profile.name?.familyName),
      picture: this.normalizePictureUrl(profile.photos?.[0]?.value),
    };
  }

  private normalizeProviderId(value: unknown): string {
    if (typeof value !== 'string' || !value.trim() || value.length > 255) {
      throw new UnauthorizedException({
        code: 'INVALID_GOOGLE_PROFILE',
        message: 'Google authentication failed',
      });
    }
    return value.trim();
  }

  private normalizeEmail(value: string | undefined): string | null {
    if (typeof value !== 'string') {
      return null;
    }
    const email = value.trim().toLowerCase();
    if (!email || email.length > 254) {
      return null;
    }
    return email;
  }

  private normalizeOptionalName(value: string | undefined): string | null {
    if (typeof value !== 'string') {
      return null;
    }
    const name = value.trim().replace(/\s+/g, ' ').slice(0, 150);
    return name || null;
  }

  private normalizePictureUrl(value: string | undefined): string | null {
    if (typeof value !== 'string' || value.length > 2_048) {
      return null;
    }
    try {
      const url = new URL(value);
      /*
       * Never propagate javascript:, data:, file:, etc.
       */
      if (url.protocol !== 'https:') {
        return null;
      }
      return url.toString();
    } catch {
      return null;
    }
  }
}
