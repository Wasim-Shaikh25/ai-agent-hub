import 'dotenv/config';

/** Centralised, typed access to environment configuration. */
export interface Config {
  port: number;
  databaseUrl: string;
  redisUrl: string;
  litellmUrl: string;
  litellmMasterKey: string;
  embeddingsProvider: 'local' | 'litellm';
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
  embeddingsProvider: env('EMBEDDINGS_PROVIDER', 'local') === 'litellm' ? 'litellm' : 'local',
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
};
