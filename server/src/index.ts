import Fastify from 'fastify';
import cors from '@fastify/cors';
import { config } from './config.js';
import { migrate, seedDev } from './db/migrate.js';
import { resolveApiKey, bearer } from './auth.js';
import { registerApiRoutes } from './routes/api.js';
import { registerGatewayRoutes } from './routes/gateway.js';
import { handleMcpRequest } from './mcp/server.js';

async function main(): Promise<void> {
  // Ensure schema + dev seed before serving traffic.
  await migrate();
  await seedDev();

  const app = Fastify({ logger: true, bodyLimit: 10 * 1024 * 1024 });
  await app.register(cors, { origin: true });

  app.get('/health', async () => ({ status: 'ok', service: 'hub-server', ts: new Date().toISOString() }));

  await registerApiRoutes(app);
  await registerGatewayRoutes(app);

  // Native MCP endpoint (Streamable HTTP, stateless).
  app.post('/mcp', async (req, reply) => {
    const auth = await resolveApiKey(bearer(req.headers.authorization));
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
