#!/usr/bin/env node
// Minimal MCP server over stdio for smoke testing mcp-proxy.
import { createInterface } from 'node:readline';

const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: false });

rl.on('line', (line) => {
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return;
  }

  if (msg.method === 'initialize') {
    const response = {
      jsonrpc: '2.0',
      id: msg.id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {}, prompts: {}, resources: {} },
        serverInfo: { name: 'fake-mcp-server', version: '1.0.0' },
      },
    };
    process.stdout.write(JSON.stringify(response) + '\n');
  } else if (msg.method === 'tools/list') {
    const response = {
      jsonrpc: '2.0',
      id: msg.id,
      result: { tools: [] },
    };
    process.stdout.write(JSON.stringify(response) + '\n');
  }
  // notifications (initialized, etc.) require no response
});
