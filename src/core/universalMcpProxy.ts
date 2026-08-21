import * as http from 'http';
import * as https from 'https';
import * as net from 'net';
import { URL } from 'url';

const HOP_BY_HOP = new Set(['content-length', 'transfer-encoding', 'connection', 'keep-alive', 'upgrade', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer']);

/**
 * A local HTTP proxy that exposes the Hub's MCP endpoint in a single,
 * agent-agnostic format. Any AI coding assistant (or shell/curl) that can
 * make HTTP requests can call it, without needing to know the Hub API key
 * or each editor's native MCP config format.
 */
export class UniversalMcpProxy {
  private server?: http.Server;
  private port?: number;

  /**
   * Starts the proxy on a free localhost port and returns the local MCP URL.
   *
   * @param hubBaseUrl The connected Hub base URL (e.g. http://localhost:8080).
   * @param hubApiKey  The API key used to authenticate requests to the Hub.
   */
  async start(hubBaseUrl: string, hubApiKey: string): Promise<string> {
    this.stop();

    const hubUrl = new URL(`${hubBaseUrl.replace(/\/$/, '')}/mcp`);
    const port = await this.getFreePort();

    this.server = http.createServer((req, res) => {
      // Always allow local cross-origin requests so browser-based agents can call the proxy too.
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
      res.setHeader(
        'Access-Control-Allow-Headers',
        'Content-Type, Accept, Authorization, X-Hub-Project, X-Hub-Session',
      );

      if (req.method === 'OPTIONS') {
        res.writeHead(204).end();
        return;
      }

      if (req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' }).end(
          JSON.stringify({
            message: 'AI Agent Hub universal MCP proxy',
            endpoint: this.getUrl(),
          }),
        );
        return;
      }

      if (req.method !== 'POST' || req.url !== '/mcp') {
        res.writeHead(404, { 'Content-Type': 'application/json' }).end(
          JSON.stringify({ jsonrpc: '2.0', error: { code: -32601, message: 'Not found' }, id: null }),
        );
        return;
      }

      this.forward(req, res, hubUrl, hubApiKey);
    });

    return new Promise((resolve, reject) => {
      this.server!.once('error', reject);
      this.server!.listen(port, '127.0.0.1', () => {
        this.port = port;
        resolve(this.getUrl()!);
      });
    });
  }

  /** Stops the proxy server, if running. */
  stop(): void {
    if (this.server) {
      this.server.close();
      this.server = undefined;
      this.port = undefined;
    }
  }

  /** Returns the local MCP endpoint URL, or undefined if not running. */
  getUrl(): string | undefined {
    if (!this.port) return undefined;
    return `http://127.0.0.1:${this.port}/mcp`;
  }

  private getFreePort(): Promise<number> {
    return new Promise((resolve, reject) => {
      const srv = net.createServer();
      srv.once('error', reject);
      srv.listen(0, '127.0.0.1', () => {
        const addr = srv.address();
        const port = typeof addr === 'object' && addr ? addr.port : 0;
        srv.close(() => resolve(port));
      });
    });
  }

  private forward(req: http.IncomingMessage, res: http.ServerResponse, hubUrl: URL, hubApiKey: string): void {
    const headers: http.OutgoingHttpHeaders = {
      Authorization: `Bearer ${hubApiKey}`,
      'Content-Type': req.headers['content-type'] || 'application/json',
      Accept: req.headers['accept'] || 'application/json, text/event-stream',
    };

    const project = req.headers['x-hub-project'];
    if (typeof project === 'string') {
      headers['X-Hub-Project'] = project;
    }
    const session = req.headers['x-hub-session'];
    if (typeof session === 'string') {
      headers['X-Hub-Session'] = session;
    }

    const client = hubUrl.protocol === 'https:' ? https : http;
    const proxyReq = client.request(
      {
        protocol: hubUrl.protocol,
        hostname: hubUrl.hostname,
        port: hubUrl.port || (hubUrl.protocol === 'https:' ? 443 : 80),
        path: `${hubUrl.pathname}${hubUrl.search}`,
        method: 'POST',
        headers,
      },
      (proxyRes) => {
        const responseHeaders: http.OutgoingHttpHeaders = {};
        for (const [key, value] of Object.entries(proxyRes.headers)) {
          if (value === undefined) continue;
          if (HOP_BY_HOP.has(key.toLowerCase())) continue;
          responseHeaders[key] = value;
        }
        res.writeHead(proxyRes.statusCode || 502, responseHeaders);
        proxyRes.pipe(res);
      },
    );

    proxyReq.on('error', (err) => {
      res.writeHead(502, { 'Content-Type': 'application/json' }).end(
        JSON.stringify({
          jsonrpc: '2.0',
          error: { code: -32000, message: `Upstream error: ${err.message}` },
          id: null,
        }),
      );
    });

    req.pipe(proxyReq);
  }
}
