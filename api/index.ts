
import type { IncomingMessage, ServerResponse } from 'node:http';

type VercelRequest = IncomingMessage & {
  url?: string;
};

type VercelResponse = ServerResponse<IncomingMessage>;

export default async function handler(
  request: VercelRequest,
  response: VercelResponse
) {
  const { app } = await import('../apps/api/src/app.js');
  return app(request, response);
}
