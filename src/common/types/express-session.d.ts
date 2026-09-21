import 'express-session';

declare module 'express-session' {
  interface SessionData {
    csrfInitialized?: boolean;
    lastActivity?: number;
    user?: {
      id: string;
      username: string;
      roles: string[];
    };
  }
}
