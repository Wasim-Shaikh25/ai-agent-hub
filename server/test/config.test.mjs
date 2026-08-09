import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const configPath = path.resolve(__dirname, '../dist/config.js');

function runConfig(env) {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      process.execPath,
      ['--input-type=module', '-e', `import('${configPath}')`],
      {
        env: { ...process.env, ...env },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => {
      stdout += d.toString();
    });
    proc.stderr.on('data', (d) => {
      stderr += d.toString();
    });
    proc.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });
    proc.on('error', reject);
  });
}

describe('config safe-configuration guard', () => {
  it('exits with an error in production when JWT_SECRET is too short', async () => {
    const result = await runConfig({
      NODE_ENV: 'production',
      JWT_SECRET: 'short',
      SUPERADMIN_PASSWORD: 'prod-superadmin-password-long',
      DEV_API_KEY: '',
    });
    assert.notEqual(result.code, 0, `expected non-zero exit, got ${result.code}: ${result.stderr}`);
    assert(result.stderr.includes('JWT_SECRET must be at least 32 characters'), result.stderr);
  });

  it('exits with an error in production when SUPERADMIN_PASSWORD is too short', async () => {
    const result = await runConfig({
      NODE_ENV: 'production',
      JWT_SECRET: 'prod-jwt-secret-must-be-at-least-thirty-two-characters-long',
      SUPERADMIN_PASSWORD: 'short',
      DEV_API_KEY: '',
    });
    assert.notEqual(result.code, 0, `expected non-zero exit, got ${result.code}: ${result.stderr}`);
    assert(result.stderr.includes('SUPERADMIN_PASSWORD must be at least 12 characters'), result.stderr);
  });

  it('exits with an error when DEV_API_KEY is a known default', async () => {
    const result = await runConfig({
      NODE_ENV: 'production',
      JWT_SECRET: 'prod-jwt-secret-must-be-at-least-thirty-two-characters-long',
      SUPERADMIN_PASSWORD: 'prod-superadmin-password-long',
      DEV_API_KEY: 'hub_dev_localkey',
    });
    assert.notEqual(result.code, 0, `expected non-zero exit, got ${result.code}: ${result.stderr}`);
    assert(result.stderr.includes('DEV_API_KEY must be at least 16 characters and not a known default'), result.stderr);
  });

  it('loads successfully in production with strong secrets', async () => {
    const result = await runConfig({
      NODE_ENV: 'production',
      JWT_SECRET: 'prod-jwt-secret-must-be-at-least-thirty-two-characters-long',
      SUPERADMIN_PASSWORD: 'prod-superadmin-password-long',
      DEV_API_KEY: 'proddevapikeylongenough',
    });
    assert.equal(result.code, 0, `expected clean exit, got ${result.code}: ${result.stderr}`);
  });

  it('allows short defaults in test mode', async () => {
    const result = await runConfig({
      NODE_ENV: 'test',
      JWT_SECRET: 'short',
      SUPERADMIN_PASSWORD: 'short',
      DEV_API_KEY: '',
    });
    assert.equal(result.code, 0, `expected clean exit in test mode, got ${result.code}: ${result.stderr}`);
  });

  it('allows short defaults in dev mode with ALLOW_INSECURE_DEFAULTS=true', async () => {
    const result = await runConfig({
      NODE_ENV: 'development',
      JWT_SECRET: 'short',
      SUPERADMIN_PASSWORD: 'short',
      DEV_API_KEY: '',
      ALLOW_INSECURE_DEFAULTS: 'true',
    });
    assert.equal(result.code, 0, `expected clean exit with ALLOW_INSECURE_DEFAULTS, got ${result.code}: ${result.stderr}`);
  });
});
