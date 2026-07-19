import { config } from '../config.js';

export interface SsoProfile {
  email: string;
  name: string;
}

/** Pluggable SSO provider. `dev` works offline; `workos` is the real IdP. */
export interface SsoProvider {
  readonly name: string;
  /** URL to redirect the user to for authentication. */
  authorizeUrl(state: string, opts: { email?: string }): string;
  /** Exchanges the callback code for a verified profile. */
  exchangeCode(code: string): Promise<SsoProfile>;
}

/**
 * Local/dev provider — no external IdP. `authorizeUrl` bounces straight back to
 * the callback encoding the email, so the full login→session flow is testable
 * without any account. NOT for production.
 */
class DevProvider implements SsoProvider {
  readonly name = 'dev';
  authorizeUrl(state: string, opts: { email?: string }): string {
    const email = opts.email ?? 'dev@localhost';
    const code = `dev:${email}`;
    return `${config.appBaseUrl}/auth/sso/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`;
  }
  async exchangeCode(code: string): Promise<SsoProfile> {
    const email = code.startsWith('dev:') ? code.slice(4) : 'dev@localhost';
    return { email, name: email.split('@')[0] ?? email };
  }
}

/**
 * WorkOS SSO. Activated by WORKOS_API_KEY + WORKOS_CLIENT_ID. Endpoints follow
 * the WorkOS SSO API; verify against your WorkOS dashboard before go-live.
 */
class WorkOsProvider implements SsoProvider {
  readonly name = 'workos';
  authorizeUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: config.workosClientId,
      redirect_uri: `${config.appBaseUrl}/auth/sso/callback`,
      response_type: 'code',
      provider: 'authkit',
      state,
    });
    return `https://api.workos.com/sso/authorize?${params.toString()}`;
  }
  async exchangeCode(code: string): Promise<SsoProfile> {
    const res = await fetch('https://api.workos.com/sso/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: config.workosClientId,
        client_secret: config.workosApiKey,
        grant_type: 'authorization_code',
        code,
      }),
    });
    if (!res.ok) throw new Error(`WorkOS token exchange failed: ${res.status} ${await res.text()}`);
    const json = (await res.json()) as { profile?: { email?: string; first_name?: string; last_name?: string } };
    const p = json.profile ?? {};
    return { email: p.email ?? '', name: [p.first_name, p.last_name].filter(Boolean).join(' ') || (p.email ?? '') };
  }
}

let provider: SsoProvider | undefined;

/** Returns the configured SSO provider (singleton). */
export function getSsoProvider(): SsoProvider {
  if (!provider) provider = config.ssoProvider === 'workos' ? new WorkOsProvider() : new DevProvider();
  return provider;
}
