import { config } from '../config.js';

export interface OAuthProfile {
  email: string;
  name: string;
  provider: string;
  providerUserId: string;
}

export interface OAuthProvider {
  readonly name: string;
  authorizeUrl(state: string): string;
  exchangeCode(code: string): Promise<OAuthProfile>;
}

class GoogleProvider implements OAuthProvider {
  readonly name = 'google';

  private redirectUri(): string {
    return `${config.appBaseUrl}/auth/oauth/google/callback`;
  }

  authorizeUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: config.googleClientId,
      redirect_uri: this.redirectUri(),
      response_type: 'code',
      scope: 'openid email profile',
      state,
      access_type: 'offline',
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  async exchangeCode(code: string): Promise<OAuthProfile> {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: config.googleClientId,
        client_secret: config.googleClientSecret,
        redirect_uri: this.redirectUri(),
        grant_type: 'authorization_code',
      }),
    });
    if (!tokenRes.ok) {
      throw new Error(`Google token exchange failed: ${tokenRes.status} ${await tokenRes.text()}`);
    }
    const token = (await tokenRes.json()) as { access_token: string };
    const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });
    if (!userRes.ok) {
      throw new Error(`Google userinfo failed: ${userRes.status} ${await userRes.text()}`);
    }
    const profile = (await userRes.json()) as { id: string; email: string; name?: string };
    return {
      email: profile.email,
      name: profile.name || profile.email.split('@')[0] || profile.email,
      provider: 'google',
      providerUserId: profile.id,
    };
  }
}

class AppleProvider implements OAuthProvider {
  readonly name = 'apple';

  authorizeUrl(_state: string): string {
    throw new Error('Apple OAuth is not configured. Set APPLE_CLIENT_ID, APPLE_TEAM_ID, APPLE_KEY_ID, and APPLE_PRIVATE_KEY.');
  }

  exchangeCode(_code: string): Promise<OAuthProfile> {
    throw new Error('Apple OAuth is not configured');
  }
}

const providers: Record<string, OAuthProvider> = {
  google: new GoogleProvider(),
  apple: new AppleProvider(),
};

export function getOAuthProvider(name: string): OAuthProvider | undefined {
  return providers[name.toLowerCase()];
}
