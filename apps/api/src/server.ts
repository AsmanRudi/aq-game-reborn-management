
import { app } from './app.js';
import { env } from './config.js';

// Local development server.
// Vercel uses the default export as its serverless handler.
export default app;

if (process.env.VERCEL !== '1') {
  app.listen(env.API_PORT, () => {
    console.log(`AQ Game API berjalan pada port ${env.API_PORT}`);
  });
}
