import 'dotenv/config';
import { randomUUID } from 'node:crypto';

/** Centralised, typed access to environment configuration. */
export interface Config {
  port: number;
  databaseUrl: string;
  redisUrl: string;
  litellmUrl: string;
  litellmMasterKey: string;
  embeddingsProvider: 'local' | 'litellm' | 'minilm';
  embeddingDim: number;
  devSeed: boolean;
  devApiKey: string;
  jwtSecret: string;
  appBaseUrl: string;
  ssoProvider: 'dev' | 'workos';
  workosApiKey: string;
  workosClientId: string;
  rlsEnabled: boolean;
  stripeSecretKey: string;
  stripeWebhookSecret: string;
  redactionEnabled: boolean;
  redactionMode: 'redact' | 'block';
  storageMode: 'central' | 'local';
  logPrompts: boolean;
  cacheEnabled: boolean;
  cacheThreshold: number;
  cacheTtlDays: number;
  defaultVisibility: string;
  summaryModel: string;
  corsOrigin: string;
  rateLimitPerMin: number;
  memoryHalflifeDays: number;
  slowRequestMs: number;
  models: string;
  enableAiAssistant: boolean;
  googleClientId: string;
  googleClientSecret: string;
  appleClientId: string;
  appleTeamId: string;
  appleKeyId: string;
  applePrivateKey: string;
  superadminId: string;
  superadminEmail: string;
  superadminMobile: string;
  superadminPassword: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  smtpFrom: string;
}

function env(key: string, fallback: string): string {
  const v = process.env[key];
  return v === undefined || v === '' ? fallback : v;
}

export const config: Config = {
  port: Number(env('PORT', '8080')),
  databaseUrl: env('DATABASE_URL', 'postgres://hub:hub@localhost:5432/hub'),
  redisUrl: env('REDIS_URL', 'redis://localhost:6379'),
  litellmUrl: env('LITELLM_URL', 'http://localhost:4000'),
  litellmMasterKey: env('LITELLM_MASTER_KEY', 'sk-local-master'),
  embeddingsProvider: ((): 'local' | 'litellm' | 'minilm' => {
    // Default to in-process MiniLM (real semantic vectors, no API key). Falls
    // back to the local hash automatically if the optional model dep is absent.
    const p = env('EMBEDDINGS_PROVIDER', 'minilm');
    return p === 'litellm' ? 'litellm' : p === 'local' ? 'local' : 'minilm';
  })(),
  embeddingDim: Number(env('EMBEDDING_DIM', '1536')),
  devSeed: env('DEV_SEED', 'true') === 'true',
  devApiKey: env('DEV_API_KEY', 'hub_dev_localkey'),
  jwtSecret: env('JWT_SECRET', 'dev-secret-change-me'),
  appBaseUrl: env('APP_BASE_URL', 'http://localhost:8080'),
  ssoProvider: env('SSO_PROVIDER', 'dev') === 'workos' ? 'workos' : 'dev',
  workosApiKey: env('WORKOS_API_KEY', ''),
  workosClientId: env('WORKOS_CLIENT_ID', ''),
  rlsEnabled: env('RLS_ENABLED', 'false') === 'true',
  stripeSecretKey: env('STRIPE_SECRET_KEY', ''),
  stripeWebhookSecret: env('STRIPE_WEBHOOK_SECRET', ''),
  redactionEnabled: env('REDACTION_ENABLED', 'true') === 'true',
  redactionMode: env('REDACTION_MODE', 'redact') === 'block' ? 'block' : 'redact',
  storageMode: env('STORAGE_MODE', 'central') === 'local' ? 'local' : 'central',
  logPrompts: env('LOG_PROMPTS', 'false') === 'true',
  cacheEnabled: env('CACHE_ENABLED', 'false') === 'true',
  cacheThreshold: Number(env('CACHE_THRESHOLD', '0.05')),
  cacheTtlDays: Number(env('CACHE_TTL_DAYS', '7')),
  defaultVisibility: env('DEFAULT_VISIBILITY', 'project'),
  summaryModel: env('SUMMARY_MODEL', 'gpt-4o-mini'),
  corsOrigin: env('CORS_ORIGIN', '*'),
  rateLimitPerMin: Number(env('RATE_LIMIT_PER_MIN', '600')),
  memoryHalflifeDays: Number(env('MEMORY_HALFLIFE_DAYS', '30')),
  slowRequestMs: Number(env('SLOW_REQUEST_MS', '20000')),
  models: env('HUB_MODELS', ''),
  enableAiAssistant: env('ENABLE_AI_ASSISTANT', 'false') === 'true',
  googleClientId: env('GOOGLE_CLIENT_ID', ''),
  googleClientSecret: env('GOOGLE_CLIENT_SECRET', ''),
  appleClientId: env('APPLE_CLIENT_ID', ''),
  appleTeamId: env('APPLE_TEAM_ID', ''),
  appleKeyId: env('APPLE_KEY_ID', ''),
  applePrivateKey: env('APPLE_PRIVATE_KEY', ''),
  superadminId: env('SUPERADMIN_ID', randomUUID()),
  superadminEmail: env('SUPERADMIN_EMAIL', 'admin@localhost'),
  superadminMobile: env('SUPERADMIN_MOBILE', ''),
  superadminPassword: env('SUPERADMIN_PASSWORD', 'change-me'),
  smtpHost: env('SMTP_HOST', ''),
  smtpPort: Number(env('SMTP_PORT', '587')),
  smtpUser: env('SMTP_USER', ''),
  smtpPass: env('SMTP_PASS', ''),
  smtpFrom: env('SMTP_FROM', 'noreply@example.com'),
};
