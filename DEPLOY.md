# Deploy AQ Game Reborn Management

## Backend (Railway - Gratís)
1. Buka https://railway.app
2. Import repository: https://github.com/AsmanRudi/aq-game-reborn-management
3. Set environment variables di Railway dashboard:
   - `DATABASE_URL=postgresql://...`
   - `SESSION_SECRET=...`
   - `NODE_ENV=production`
4. Deploy → dapat URL backend (contoh: `https://aq-game-api.railway.app`)

## Frontend (Vercel - Gratís)
1. Buka https://vercel.com
2. Import repository
3. Set environment variable: `VITE_API_URL=https://your-backend-url/api/v1`
4. Deploy → dapat URL frontend (contoh: `https://aq-game-web.vercel.app`)

## Environment Variables

### Backend (Railway)
```
NODE_ENV=production
DATABASE_URL=postgresql://username:password@host:port/database
SESSION_SECRET=your-32-char-secret
```

### Frontend (Vercel)
```
VITE_API_URL=https://your-backend-url/api/v1
```

## Database Migration
```bash
npx prisma migrate deploy
npx prisma generate
```