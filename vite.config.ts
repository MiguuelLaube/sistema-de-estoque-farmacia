import vue from '@vitejs/plugin-vue';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import { processWhatsAppProxyRequest } from './api/whatsapp.ts';
import { processXmlAiMatchRequest } from './api/xml-ai-match.ts';

function backendApiMiddlewaresPlugin(serverEnv: Record<string, string>): Plugin {
  return {
    name: 'encomed-backend-api-middlewares',
    configureServer(server) {
      server.middlewares.use('/api/whatsapp', async (req, res) => {
        const chunks: Buffer[] = [];
        for await (const chunk of req) {
          chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
        }
        let body = {};
        if (chunks.length > 0) {
          try {
            body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          } catch {
            body = {};
          }
        }

        const authHeader = typeof req.headers.authorization === 'string' ? req.headers.authorization : undefined;
        const result = await processWhatsAppProxyRequest(req.method, authHeader, body, serverEnv);

        res.statusCode = result.status;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.end(JSON.stringify(result.payload));
      });

      server.middlewares.use('/api/xml-ai-match', async (req, res) => {
        const chunks: Buffer[] = [];
        for await (const chunk of req) {
          chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
        }
        let body = {};
        if (chunks.length > 0) {
          try {
            body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          } catch {
            body = {};
          }
        }

        const authHeader = typeof req.headers.authorization === 'string' ? req.headers.authorization : undefined;
        const result = await processXmlAiMatchRequest(req.method, authHeader, body, serverEnv);

        res.statusCode = result.status;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.end(JSON.stringify(result.payload));
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // Carrega variáveis sem prefixo VITE_ APENAS no processo Node.js do servidor (nunca enviadas ao bundle do navegador)
  const serverEnv = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [vue(), backendApiMiddlewaresPlugin(serverEnv)],
  };
});
