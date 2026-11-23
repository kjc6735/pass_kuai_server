import type { SocialProvider } from '../../generated/prisma/enums';

export interface SocialLoginInput {
  token: string;
  authorizationCode?: string;
}

export interface SocialProfile {
  providerUserId: string;
  appleRefreshToken?: string;
}

export interface DisconnectInput {
  token: string;
  appleRefreshToken?: string | null;
}

export interface SocialVerifier {
  readonly provider: SocialProvider;
  verify(input: SocialLoginInput): Promise<SocialProfile>;
  disconnect(input: DisconnectInput): Promise<void>;
}
