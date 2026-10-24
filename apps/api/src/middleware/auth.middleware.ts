import type { NextFunction, Request, Response } from 'express';
import type { AuthenticatedUser } from '../services/auth.service.js';
import { findAuthenticatedSession } from '../services/auth.service.js';

declare global {
  namespace Express {
    interface Request {
      auth?: AuthenticatedUser;
    }
  }
}

export async function authenticate(request: Request, response: Response, next: NextFunction) {
  const authorization = request.header('authorization');
  const token = authorization?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];
  if (!token) {
    response.status(401).json({ error: 'Autentikasi diperlukan.' });
    return;
  }

  try {
    const user = await findAuthenticatedSession(token);
    if (!user) {
      response.status(401).json({ error: 'Sesi tidak valid atau telah berakhir.' });
      return;
    }
    request.auth = user;
    next();
  } catch (error) {
    next(error);
  }
}

export function requireRole(...roles: AuthenticatedUser['role'][]) {
  return (request: Request, response: Response, next: NextFunction) => {
    if (!request.auth || !roles.includes(request.auth.role)) {
      response.status(403).json({ error: 'Anda tidak memiliki izin untuk tindakan ini.' });
      return;
    }
    next();
  };
}

export function requireAuthenticatedUser(request: Request): AuthenticatedUser {
  if (!request.auth) throw new Error('Authenticated route was invoked without an authenticated user.');
  return request.auth;
}
