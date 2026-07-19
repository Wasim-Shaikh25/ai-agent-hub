import Fastify from 'fastify';
import cors from '@fastify/cors';
import { config } from './config.js';
import { migrate, seedDev } from './db/migrate.js';
import { resolveAuth, bearer } from './auth.js';
import { registerApiRoutes } from './routes/api.js';
import { registerGatewayRoutes } from './routes/gateway.js';
import { registerAdminRoutes } from './routes/admin.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerBillingRoutes } from './routes/billing.js';
import { handleMcpRequest } from './mcp/server.js';

async function main(): Promise<void> {
  // Ensure schema + dev seed before serving traffic.
  await migrate();
  await seedDev();

  const app = Fastify({ logger: true, bodyLimit: 10 * 1024 * 1024 });
  await app.register(cors, { origin: true });

  // Parse JSON but retain the raw bytes (needed for Stripe webhook signatures).
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (req, body, done) => {
    (req as typeof req & { rawBody?: Buffer }).rawBody = body as Buffer;
    try {
      done(null, JSON.parse((body as Buffer).toString('utf-8') || '{}'));
    } catch (err) {
      done(err as Error, undefined);
    }
  });

  app.get('/health', async () => ({ status: 'ok', service: 'hub-server', ts: new Date().toISOString() }));

  await registerAuthRoutes(app);
  await registerApiRoutes(app);
  await registerGatewayRoutes(app);
  await registerAdminRoutes(app);
  await registerBillingRoutes(app);

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
}

main().catch((err) => {
  console.error('[hub-server] fatal:', err);
  process.exit(1);
});
