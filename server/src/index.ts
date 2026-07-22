import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { config } from './config.js';
import { migrate, seedDev } from './db/migrate.js';
import { pool } from './db/pool.js';
import { resolveAuth, bearer } from './auth.js';
import { registerApiRoutes } from './routes/api.js';
import { registerGatewayRoutes } from './routes/gateway.js';
import { registerAdminRoutes } from './routes/admin.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerBillingRoutes } from './routes/billing.js';
import { registerPrivacyRoutes } from './routes/privacy.js';
import { registerMetricsRoutes } from './routes/metrics.js';
import { registerDashboardRoutes } from './routes/dashboard.js';
import { registerWebappRoutes } from './routes/webapp.js';
import { registerAdminUiRoutes } from './routes/adminui.js';
import { startRetentionScheduler } from './services/retentionScheduler.js';
import { handleMcpRequest } from './mcp/server.js';

async function main(): Promise<void> {
  // Ensure schema + dev seed before serving traffic.
  await migrate();
  await seedDev();

  const app = Fastify({ logger: true, bodyLimit: 10 * 1024 * 1024, trustProxy: true });

  // Security headers. CSP is relaxed for the dashboard's inline CSS/JS.
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, { origin: config.corsOrigin === '*' ? true : config.corsOrigin.split(','), credentials: true });

  // Rate limit per API key / IP so a noisy client can't overwhelm the server.
  await app.register(rateLimit, {
    max: config.rateLimitPerMin,
    timeWindow: '1 minute',
    keyGenerator: (req) => bearer(req.headers.authorization) ?? req.ip,
    allowList: (req) => req.url === '/health' || req.url === '/ready',
  });

  // Parse JSON but retain the raw bytes (needed for Stripe webhook signatures).
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (req, body, done) => {
    (req as typeof req & { rawBody?: Buffer }).rawBody = body as Buffer;
    try {
      done(null, JSON.parse((body as Buffer).toString('utf-8') || '{}'));
    } catch (err) {
      done(err as Error, undefined);
    }
  });

  // Don't leak internals; log the real error, return a clean envelope.
  app.setErrorHandler((err, req, reply) => {
    const status = err.statusCode && err.statusCode >= 400 ? err.statusCode : 500;
    if (status >= 500) req.log.error(err);
    reply.code(status).send({ error: { code: status === 429 ? 'rate_limited' : 'server_error', message: status >= 500 ? 'Internal server error' : err.message } });
  });

  app.get('/health', async () => ({ status: 'ok', service: 'hub-server', version: '0.1.0', ts: new Date().toISOString() }));
  app.get('/ready', async (_req, reply) => {
    try {
      await pool.query('SELECT 1');
      return { status: 'ready' };
    } catch {
      return reply.code(503).send({ status: 'not_ready', reason: 'database unavailable' });
    }
  });

  await registerAuthRoutes(app);
  await registerApiRoutes(app);
  await registerGatewayRoutes(app);
  await registerAdminRoutes(app);
  await registerBillingRoutes(app);
  await registerPrivacyRoutes(app);
  await registerMetricsRoutes(app);
  await registerDashboardRoutes(app);
  await registerWebappRoutes(app);
  await registerAdminUiRoutes(app);

  // Native MCP endpoint (Streamable HTTP, stateless).
  app.post('/mcp', async (req, reply) => {
    const auth = await resolveAuth(bearer(req.headers.authorization));
    if (!auth) {
      return reply.code(401).send({
        jsonrpc: '2.0',
        error: { code: -32001, message: 'Unauthorized: invalid or missing API key' },
        id: null,
      });
    }
    // Hand the raw request/response to the MCP transport.
    reply.hijack();
    await handleMcpRequest(req.raw, reply.raw, req.body, auth);
  });

  await app.listen({ port: config.port, host: '0.0.0.0' });
  app.log.info(`hub-server listening on :${config.port}`);

  const stopRetention = startRetentionScheduler();

  // Graceful shutdown: stop accepting traffic, drain, close the pool.
  const shutdown = async (signal: string): Promise<void> => {
    app.log.info(`${signal} received — shutting down`);
    stopRetention();
    try {
      await app.close();
      await pool.end();
    } finally {
      process.exit(0);
    }
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('[hub-server] fatal:', err);
  process.exit(1);
});
