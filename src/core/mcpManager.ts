import { spawn, ChildProcess } from 'child_process';
import { createRequire } from 'module';
import * as path from 'path';
import * as vscode from 'vscode';
import { McpServerConfig, McpServerState } from './types';
import {
  isValidNpmPackageName,
  isValidMcpArg,
  validateEnvRecord,
  isPortAvailable,
} from '../utils/mcpEnv';

/**
 * Resolves the absolute path to the pinned `mcp-proxy` binary bundled
 * with the extension. This avoids unpinned `npx mcp-proxy` at runtime.
 */
function resolveMcpProxyBin(): string {
  const require = createRequire(__filename);
  const pkg = require('mcp-proxy/package.json');
  const bin = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin['mcp-proxy'];
  return require.resolve(path.posix.join('mcp-proxy', bin));
}

/**
 * Manages MCP server child processes.
 *
 * Each registered MCP server is started via the bundled `mcp-proxy`
 * binary and kept alive as a child process for the lifetime of the
 * extension. The manager tracks runtime state and generates
 * rule markdown that AI agents can use to discover and call
 * MCP tools over HTTP.
 */
export class McpManager {
  private readonly processes = new Map<string, ChildProcess>();
  private readonly states = new Map<string, McpServerState>();

  /**
   * Starts an MCP server process.
   *
   * Performs a final security validation on the configuration,
   * then spawns the bundled `mcp-proxy` binary via `node` with
   * `shell: false` to avoid shell injection. The inner MCP server
   * is spawned directly by `mcp-proxy` using the validated package
   * name and argument list.
   *
   * @param config The MCP server configuration.
   */
  async start(config: McpServerConfig): Promise<McpServerState> {
    if (this.processes.has(config.id)) {
      return this.getState(config.id);
    }

    const securityErrors = this.validateConfig(config);
    if (securityErrors.length > 0) {
      const message = securityErrors.join('; ');
      this.setState(config.id, { configId: config.id, status: 'error', error: message });
      vscode.window.showErrorMessage(`MCP server "${config.name}" rejected: ${message}`);
      throw new Error(message);
    }

    const portAvailable = await isPortAvailable(config.port);
    if (!portAvailable) {
      const message = `Port ${config.port} is already in use`;
      this.setState(config.id, { configId: config.id, status: 'error', error: message });
      vscode.window.showErrorMessage(`MCP server "${config.name}" rejected: ${message}`);
      throw new Error(message);
    }

    this.setState(config.id, { configId: config.id, status: 'starting' });

    const url = `http://localhost:${config.port}`;

    // Resolve the pinned mcp-proxy binary bundled with the extension.
    let mcpProxyBin: string;
    try {
      mcpProxyBin = resolveMcpProxyBin();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.setState(config.id, { configId: config.id, status: 'error', error: message });
      vscode.window.showErrorMessage(`MCP server "${config.name}" rejected: ${message}`);
      throw new Error(message);
    }

    // Use platform-specific npx command so we can keep shell: false.
    const npxBin = process.platform === 'win32' ? 'npx.cmd' : 'npx';

    // mcp-proxy runs the inner command directly (without --shell) so that
    // the validated packageName/args are not re-interpreted by a shell.
    const proxyArgs = [
      mcpProxyBin,
      '--port',
      String(config.port),
      '--',
      npxBin,
      '-y',
      config.packageName,
      ...config.args,
    ];

    const env = {
      ...process.env,
      ...config.env,
      NPM_CONFIG_YES: 'true', // suppress npx install prompts
    };

    try {
      // Always invoke the mcp-proxy .mjs entrypoint through `node` so the
      // same command line works on Unix (shebang) and Windows.
      const child = spawn('node', proxyArgs, {
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: false,
        windowsHide: true,
      });

      this.processes.set(config.id, child);

      child.stdout?.on('data', (data: Buffer) => {
        const line = data.toString().trim();
        if (line) {
          vscode.window.setStatusBarMessage(`MCP [${config.name}]: ${line.slice(0, 80)}`, 3000);
        }
      });

      child.stderr?.on('data', (data: Buffer) => {
        const line = data.toString().trim();
        // Many MCP servers write startup info to stderr — not an error
        if (line.toLowerCase().includes('error')) {
          this.setState(config.id, { configId: config.id, status: 'error', error: line, url });
        }
      });

      child.on('spawn', () => {
        this.setState(config.id, {
          configId: config.id,
          status: 'running',
          url,
          pid: child.pid,
        });
        vscode.window.showInformationMessage(`MCP server "${config.name}" started on ${url}`);
      });

      child.on('error', (err) => {
        this.processes.delete(config.id);
        this.setState(config.id, {
          configId: config.id,
          status: 'error',
          error: err.message,
        });
        vscode.window.showErrorMessage(`MCP server "${config.name}" failed: ${err.message}`);
      });

      child.on('exit', (code) => {
        this.processes.delete(config.id);
        if (code !== 0 && code !== null) {
          this.setState(config.id, {
            configId: config.id,
            status: 'error',
            error: `Exited with code ${code}`,
          });
        } else {
          this.setState(config.id, { configId: config.id, status: 'stopped' });
        }
      });

      return this.getState(config.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.setState(config.id, { configId: config.id, status: 'error', error: msg });
      throw err;
    }
  }

  /** Stops a running MCP server process. */
  stop(configId: string): void {
    const child = this.processes.get(configId);
    if (child) {
      child.kill();
      this.processes.delete(configId);
      this.setState(configId, { configId, status: 'stopped' });
    }
  }

  /** Stops all running MCP server processes. */
  stopAll(): void {
    for (const id of this.processes.keys()) {
      this.stop(id);
    }
  }

  /** Returns the current runtime state of an MCP server. */
  getState(configId: string): McpServerState {
    return this.states.get(configId) ?? { configId, status: 'stopped' };
  }

  /** Returns runtime states for all known servers. */
  getAllStates(): McpServerState[] {
    return [...this.states.values()];
  }

  /**
   * Generates a rule markdown file for an MCP server.
   *
   * This rule is synced to agent target folders so AI agents
   * can discover the MCP server and call its tools over HTTP,
   * even if the IDE does not natively support MCP.
   *
   * @param config The MCP server configuration.
   * @returns Markdown content for the rule file.
   */
  generateRuleMarkdown(config: McpServerConfig): string {
    const state = this.getState(config.id);
    const baseUrl = state.url ?? `http://localhost:${config.port}`;
    const status = state.status;

    return `# MCP Tool: ${config.name}

> **Developer-managed MCP server** — do not edit this file manually.
> It is auto-generated by AI Agent Hub and updated on every sync.

## Server Details

- **Name**: ${config.name}
- **Package**: \`${config.packageName}\`
- **Base URL**: \`${baseUrl}\`
- **Endpoints**: \`${baseUrl}/mcp\` (Streamable HTTP) · \`${baseUrl}/sse\` (SSE)
- **Status**: ${status}

## How to Use This MCP Server

This MCP server is running locally inside the AI Agent Hub extension,
exposed via [mcp-proxy](https://www.npmjs.com/package/mcp-proxy).

### Step 1 — List Available Tools

\`\`\`bash
curl -s -X POST ${baseUrl}/mcp \\
  -H "Content-Type: application/json" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
\`\`\`

### Step 2 — Call a Tool

\`\`\`bash
curl -s -X POST ${baseUrl}/mcp \\
  -H "Content-Type: application/json" \\
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "<tool-name>",
      "arguments": { "<arg>": "<value>" }
    }
  }'
\`\`\`

### Using in a Prompt

When asked to use this MCP server, say:

> "Use the ${config.name} MCP server. First call
> \`POST ${baseUrl}/mcp\` with
> \`{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}\`
> to list tools, then call the relevant tool."

## Configuration

\`\`\`json
{
  "name": "${config.name}",
  "package": "${config.packageName}",
  "port": ${config.port},
  "baseUrl": "${baseUrl}",
  "mcpEndpoint": "${baseUrl}/mcp",
  "sseEndpoint": "${baseUrl}/sse"
}
\`\`\`
`;
  }

  private setState(id: string, state: McpServerState): void {
    this.states.set(id, state);
  }

  private validateConfig(config: McpServerConfig): string[] {
    const errors: string[] = [];
    if (!isValidNpmPackageName(config.packageName)) {
      errors.push(`Invalid package name: "${config.packageName}"`);
    }
    for (const arg of config.args) {
      if (!isValidMcpArg(arg)) {
        errors.push(`Unsafe argument: "${arg}"`);
      }
    }
    errors.push(...validateEnvRecord(config.env));
    return errors;
  }
}
