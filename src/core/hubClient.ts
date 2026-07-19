import * as vscode from 'vscode';

/**
 * Thin client for the AI Agent Hub server. Turns the extension into a front-end
 * for the server's Context/Gateway/Governance planes: it stores the server URL
 * (globalState) + API key (secrets) and derives per-agent MCP config from the
 * server API — so config logic lives in one place (the server), not duplicated
 * across clients.
 */
export class HubClient {
  private static readonly URL_KEY = 'hub.serverUrl';
  private static readonly SECRET_KEY = 'hub.apiKey';

  constructor(private readonly ctx: vscode.ExtensionContext) {}

  async getUrl(): Promise<string | undefined> {
    return this.ctx.globalState.get<string>(HubClient.URL_KEY);
  }

  async getKey(): Promise<string | undefined> {
    return this.ctx.secrets.get(HubClient.SECRET_KEY);
  }

  async isConnected(): Promise<boolean> {
    return Boolean((await this.getUrl()) && (await this.getKey()));
  }

  async setCredentials(url: string, key: string): Promise<void> {
    await this.ctx.globalState.update(HubClient.URL_KEY, url.replace(/\/$/, ''));
    await this.ctx.secrets.store(HubClient.SECRET_KEY, key);
  }

  async clear(): Promise<void> {
    await this.ctx.globalState.update(HubClient.URL_KEY, undefined);
    await this.ctx.secrets.delete(HubClient.SECRET_KEY);
  }

  private async request<T>(path: string): Promise<T> {
    const url = await this.getUrl();
    const key = await this.getKey();
    if (!url || !key) {
      throw new Error('Not connected to a Hub. Run "AI Agent Hub: Connect to Server".');
    }
    const res = await fetch(`${url}${path}`, { headers: { Authorization: `Bearer ${key}` } });
    if (!res.ok) {
      throw new Error(`${path} → HTTP ${res.status}: ${await res.text()}`);
    }
    return (await res.json()) as T;
  }

  /** Resolves the current org/user/role, validating the credentials. */
  me(): Promise<{ org: string; user: string; role: string }> {
    return this.request('/api/me');
  }

  /** Returns the native MCP config snippet the server generates for an agent. */
  mcpConfig(agent: string): Promise<{ agent: string; file: string; config: unknown; note: string }> {
    return this.request(`/api/mcp-config?agent=${encodeURIComponent(agent)}`);
  }

  /** Lists the org's content items from the server registry. */
  listContent(): Promise<Array<{ id: string; type: string; name: string; description: string; status: string }>> {
    return this.request('/api/content');
  }
}
