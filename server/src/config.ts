import 'dotenv/config';

/** Centralised, typed access to environment configuration. */
export interface Config {
  port: number;
  databaseUrl: string;
  redisUrl: string;
  litellmUrl: string;
  embeddingsProvider: 'local' | 'litellm';
  embeddingDim: number;
  devSeed: boolean;
  devApiKey: string;
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
  embeddingsProvider: env('EMBEDDINGS_PROVIDER', 'local') === 'litellm' ? 'litellm' : 'local',
  embeddingDim: Number(env('EMBEDDING_DIM', '1536')),
  devSeed: env('DEV_SEED', 'true') === 'true',
  devApiKey: env('DEV_API_KEY', 'hub_dev_localkey'),
};
