import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import routes from './routes';
import lineWebhookRoutes from './routes/lineWebhookRoutes';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true,
}));
app.use(cookieParser());

// Line webhook needs raw body for HMAC signature verification — mount BEFORE express.json()
app.use('/api/line', express.raw({ type: 'application/json' }), lineWebhookRoutes);

app.use(express.json({ limit: '4mb' }));
app.use(express.urlencoded({ extended: true }));

// API routes
app.use('/api', routes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Malformed-JSON guard: express.json() throws before route handlers run. Return the JSON error
// shape used by the slip contract's 400 case instead of Express's default HTML 400 response.
app.use(
  (err: { type?: string }, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err?.type === 'entity.parse.failed') {
      res.status(400).json({ error: 'Malformed JSON' });
      return;
    }
    next(err);
  }
);

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

