// Express App - Main Server Application
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import { fileURLToPath } from 'url';

import routes from './routes/index.js';
import { serverConfig } from './config/index.js';

// Needed for __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create Express app
const app = express();

/* ======================
   Security middleware
====================== */
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
      },
    },
  })
);

/* ======================
   CORS
====================== */
app.use(
  cors({
    origin: "*",
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

/* ======================
   Logging
====================== */
app.use(morgan('combined'));

/* ======================
   Body parsing
====================== */
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

/* ======================
   API routes
====================== */
app.use('/apiv2/v1', routes);

/* ======================
   Serve Frontend (Vite build)
====================== */
const distPath = path.resolve(__dirname, '../client');

app.use(express.static(distPath));

// SPA fallback (React Router support)
app.get(/^(?!\/apiv2\/).*/, (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

/* ======================
   Error handling
====================== */
app.use(
  (
    err: any,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    console.error('Unhandled error:', err);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message:
          serverConfig.nodeEnv === 'production'
            ? 'An unexpected error occurred'
            : err?.message,
      },
    });
  }
);

export default app;