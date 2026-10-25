import { app } from './app.js';
import { env } from './config.js';

// Vercel serverless handler - must be a function
export default async function handler(request: any, response: any) {
  return app(request, response);
}

// For local development
if (process.env.VERCEL !== '1') {
  app.listen(env.API_PORT, () => {
    console.log(`AQ Game API berjalan pada port ${env.API_PORT}`);
  });
}