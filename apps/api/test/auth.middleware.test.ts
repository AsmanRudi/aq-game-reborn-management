import { describe, expect, it, vi } from 'vitest';
import { requireRole } from '../src/middleware/auth.middleware.js';
import type { Request, Response, NextFunction } from 'express';

describe('Auth Middleware Unit Tests', () => {
  it('allows access when user has required ADMIN role', () => {
    const middleware = requireRole('ADMIN');
    const req = {
      auth: {
        userId: 'admin-id',
        name: 'Admin User',
        email: 'admin@example.com',
        role: 'ADMIN' as const,
        sessionId: 'session-id',
      },
    } as unknown as Request;

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as unknown as Response;

    const next = vi.fn() as NextFunction;

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('rejects access with 403 when CASHIER attempts ADMIN action', () => {
    const middleware = requireRole('ADMIN');
    const req = {
      auth: {
        userId: 'cashier-id',
        name: 'Kasir User',
        email: 'kasir@example.com',
        role: 'CASHIER' as const,
        sessionId: 'session-id',
      },
    } as unknown as Request;

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as unknown as Response;

    const next = vi.fn() as NextFunction;

    middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Anda tidak memiliki izin untuk tindakan ini.',
    });
  });

  it('rejects unauthenticated request with 403', () => {
    const middleware = requireRole('ADMIN', 'CASHIER');
    const req = {} as unknown as Request;

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as unknown as Response;

    const next = vi.fn() as NextFunction;

    middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });
});

