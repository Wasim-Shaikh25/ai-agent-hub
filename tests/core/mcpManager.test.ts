import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as net from 'net';
import * as path from 'path';
import { McpManager } from '../../src/core/mcpManager';
import { resetVscodeMocks } from '../../__mocks__/vscode';

vi.mock('vscode', async () => import('../../__mocks__/vscode'));

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, () => {
      const address = server.address();
      if (address && typeof address === 'object') {
        const port = address.port;
        server.close(() => resolve(port));
      } else {
        reject(new Error('Could not get a free port'));
      }
    });
    server.on('error', reject);
  });
}

describe('McpManager', () => {
  let manager: McpManager;

  beforeEach(() => {
    manager = new McpManager();
  });

  afterEach(() => {
    manager.stopAll();
    resetVscodeMocks();
  });

  it('starts mcp-proxy and reports the server as running', async () => {
    const port = await getFreePort();
    const fakeServerPath = path.resolve(process.cwd(), 'scripts', 'fake-mcp-server.mjs');

    const state = await manager.start({
      id: 'fake-server',
      name: 'Fake MCP Server',
      packageName: 'node',
      args: [fakeServerPath],
      env: {},
      port,
      autoStart: false,
      developerOnly: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    expect(state.status).toBe('starting');

    // Wait for the proxy to initialize and the state to flip to running.
    await new Promise<void>((resolve, reject) => {
      const start = Date.now();
      const interval = setInterval(() => {
        const s = manager.getState('fake-server');
        if (s.status === 'running') {
          clearInterval(interval);
          resolve();
        }
        if (s.status === 'error' || Date.now() - start > 10000) {
          clearInterval(interval);
          reject(new Error(`MCP server did not start: ${JSON.stringify(s)}`));
        }
      }, 100);
    });

    const finalState = manager.getState('fake-server');
    expect(finalState.status).toBe('running');
    expect(finalState.url).toBe(`http://localhost:${port}`);
    expect(finalState.pid).toBeGreaterThan(0);
  });

  it('rejects an unsafe package name before spawning', async () => {
    await expect(
      manager.start({
        id: 'bad',
        name: 'Bad Server',
        packageName: 'bad; rm -rf /',
        args: [],
        env: {},
        port: 12345,
        autoStart: false,
        developerOnly: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
    ).rejects.toThrow('Invalid package name');

    expect(manager.getState('bad').status).toBe('error');
  });

  it('rejects unsafe argument characters', async () => {
    await expect(
      manager.start({
        id: 'bad-arg',
        name: 'Bad Arg Server',
        packageName: 'node',
        args: ['; rm -rf /'],
        env: {},
        port: 12345,
        autoStart: false,
        developerOnly: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
    ).rejects.toThrow('Unsafe argument');
  });
});
