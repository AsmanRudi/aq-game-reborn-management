import { app } from './app.js';
import { env } from './config.js';

// For local development
if (require.main === module) {
  app.listen(env.API_PORT, () => {
    console.log(`AQ Game API berjalan pada port ${env.API_PORT}`);
  });
}

export default app;