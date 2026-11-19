import 'dotenv/config';
import express from 'express';
import http from 'http';
import path from 'path';
import { apiRouter } from './src/server/routes/api.ts';
import { attachRealtimeServer } from './src/server/realtime.ts';

async function startServer() {
  const app = express();
  const port = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '2mb' }));
  app.use('/api', apiRouter);

  const server = http.createServer(app);
  attachRealtimeServer(server);

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(port, '0.0.0.0', () => {
    console.log(`LinkUp server listening on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start LinkUp server:', err);
  process.exit(1);
});
