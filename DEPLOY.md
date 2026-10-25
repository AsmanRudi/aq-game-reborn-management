# Deploy AQ Game Reborn Management

## Backend (Railway - Gratís)
1. Buka https://railway.app
2. Click "New Project" → "Deploy from GitHub repo"
3. Import: https://github.com/AsmanRudi/aq-game-reborn-management
4. Set Environment Variables in Railway dashboard:
   - `NODE_ENV=production`
   - `DATABASE_URL=postgresql://username:password@host:port/database`
   - `SESSION_SECRET=aq_game_reborn_super_secret_session_key_2026_at_least_32_chars`
5. Deploy → Dapat URL backend (contoh: `https://aq-game-api.railway.app`)

## Frontend (Vercel - Gratís)
1. Buka https://vercel.com
2. Import repository
3. Set Environment Variable: `VITE_API_URL=https://your-backend-url/api/v1`
4. Deploy → Dapat URL frontend (contoh: `https://aq-game-reborn-management.vercel.app`)

## Environment Variables

### Backend (Railway)
```
NODE_ENV=production
DATABASE_URL=postgresql://username:password@host:port/database
SESSION_SECRET=aq_game_reborn_super_secret_session_key_2026_at_least_32_chars
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