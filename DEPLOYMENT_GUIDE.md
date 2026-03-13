# ShopForge Deployment Guide
## Production Deployment — Complete Setup

---

## Architecture Overview

```
[Vercel]          [Railway/Render]      [Supabase/Neon]
Frontend    ←→    Backend API     ←→    PostgreSQL DB
(Next.js)         (Node.js)             
                      ↕
                  [Upstash Redis]   [Cloudinary]   [Stripe]
```

---

## 1. DATABASE SETUP (PostgreSQL)

### Option A: Supabase (Recommended - Free Tier)

1. Go to https://supabase.com → Create new project
2. Copy connection string from Settings → Database
3. Format: `postgresql://postgres:[password]@[host]:5432/postgres`

### Option B: Neon (Serverless PostgreSQL)

1. Go to https://neon.tech → Create database
2. Copy the connection string

### Run Migrations

```bash
cd backend

# Copy env file
cp .env.example .env
# Fill in DATABASE_URL

# Generate Prisma client
npx prisma generate

# Run migrations
npx prisma migrate deploy

# (Optional) Seed with sample data
npm run prisma:seed
```

---

## 2. REDIS SETUP (Upstash)

1. Go to https://upstash.com → Create Redis database
2. Choose region closest to your backend
3. Copy the Redis URL format: `rediss://:[password]@[host]:[port]`
4. Add to `.env`: `REDIS_URL=rediss://...`

---

## 3. CLOUDINARY SETUP (Image Storage)

1. Go to https://cloudinary.com → Create free account
2. Dashboard → Copy:
   - Cloud Name
   - API Key  
   - API Secret
3. Add to `.env`:
   ```
   CLOUDINARY_CLOUD_NAME=your-cloud-name
   CLOUDINARY_API_KEY=your-api-key
   CLOUDINARY_API_SECRET=your-api-secret
   ```

---

## 4. STRIPE SETUP (Payments)

1. Go to https://stripe.com → Create account
2. Dashboard → Developers → API Keys
3. Copy Secret Key (use test key for development)
4. For webhooks: Add endpoint `https://your-api.railway.app/api/v1/webhooks/stripe`
5. Add to `.env`:
   ```
   STRIPE_SECRET_KEY=sk_live_...
   STRIPE_WEBHOOK_SECRET=whsec_...
   ```

---

## 5. EMAIL SETUP (Resend - Recommended)

1. Go to https://resend.com → Create account
2. Add your domain or use sandbox
3. Get API key
4. Update email service to use Resend:

```javascript
// Alternative: use nodemailer with SMTP
// For Resend, install: npm install resend
```

---

## 6. BACKEND DEPLOYMENT (Railway)

### Railway Setup

1. Go to https://railway.app → Login with GitHub
2. New Project → Deploy from GitHub repo
3. Select your backend folder
4. Add environment variables from `.env`

**Start Command:**
```
npm start
```

**Environment Variables to set in Railway:**
```
NODE_ENV=production
PORT=5000
DATABASE_URL=postgresql://...
REDIS_URL=rediss://...
JWT_SECRET=<random-64-char-string>
JWT_REFRESH_SECRET=<random-64-char-string>
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
SMTP_HOST=smtp.resend.com
SMTP_PORT=465
SMTP_USER=resend
SMTP_PASS=re_...
ALLOWED_ORIGINS=https://shopforge.vercel.app
```

### Alternative: Render

1. Go to https://render.com → New Web Service
2. Connect GitHub → Select backend
3. Build Command: `npm install && npx prisma generate`
4. Start Command: `npm start`
5. Add environment variables

---

## 7. FRONTEND DEPLOYMENT (Vercel)

1. Go to https://vercel.com → Import Git Repository
2. Select frontend folder
3. Framework: Next.js (auto-detected)

**Environment Variables:**
```
NEXT_PUBLIC_API_URL=https://your-backend.railway.app/api/v1
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
NEXT_PUBLIC_APP_URL=https://shopforge.vercel.app
```

**Build Settings:**
- Build Command: `npm run build`
- Output Directory: `.next`
- Install Command: `npm install`

---

## 8. DOMAIN SETUP (Optional)

### Custom Domain on Vercel
1. Vercel → Project Settings → Domains
2. Add your domain: `shopforge.com`
3. Update DNS records as instructed

### Subdomain for stores
Configure Next.js to handle subdomains:
```javascript
// next.config.js
module.exports = {
  async rewrites() {
    return {
      beforeFiles: [
        // Rewrite store1.shopforge.com → shopforge.com/store/store1
        {
          source: '/:path*',
          has: [{ type: 'host', value: '(?<subdomain>[^.]+).shopforge.com' }],
          destination: '/store/:subdomain/:path*',
        },
      ],
    };
  },
};
```

---

## 9. PRODUCTION CHECKLIST

### Security
- [ ] Change all JWT secrets to strong random values
- [ ] Enable HTTPS (auto on Railway/Vercel)
- [ ] Set `NODE_ENV=production`
- [ ] Configure CORS with exact origins
- [ ] Rate limiting is enabled
- [ ] Helmet.js security headers active

### Database
- [ ] Run `prisma migrate deploy` on production DB
- [ ] Enable connection pooling (PgBouncer/Supabase pooler)
- [ ] Set up automated backups

### Performance
- [ ] Redis caching enabled
- [ ] CDN for static assets (Vercel handles this)
- [ ] Image optimization via Cloudinary
- [ ] Database indexes (Prisma schema handles this)

### Monitoring
- [ ] Set up error tracking (Sentry)
- [ ] Configure logging (Winston → Datadog/LogTail)
- [ ] Uptime monitoring (Better Uptime)

---

## 10. LOCAL DEVELOPMENT

```bash
# Clone repo
git clone https://github.com/yourname/shopforge

# Backend
cd shopforge/backend
cp .env.example .env
npm install
npx prisma generate
npx prisma db push       # Creates tables
npm run prisma:seed      # Optional seed data
npm run dev              # Starts on :5000

# Frontend (new terminal)
cd shopforge/frontend
cp .env.example .env.local
npm install
npm run dev              # Starts on :3000
```

**Required for local dev:**
- PostgreSQL running locally or use Docker:
  ```bash
  docker run --name shopforge-db -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres
  ```
- Redis running locally or use Docker:
  ```bash
  docker run --name shopforge-redis -p 6379:6379 -d redis
  ```

---

## 11. DOCKER DEPLOYMENT (Optional)

```dockerfile
# backend/Dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npx prisma generate
EXPOSE 5000
CMD ["npm", "start"]
```

```yaml
# docker-compose.yml
version: '3.8'
services:
  postgres:
    image: postgres:15
    environment:
      POSTGRES_DB: shopforge
      POSTGRES_PASSWORD: postgres
    ports: ["5432:5432"]
    volumes: [pgdata:/var/lib/postgresql/data]
    
  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
    
  backend:
    build: ./backend
    ports: ["5000:5000"]
    env_file: ./backend/.env
    depends_on: [postgres, redis]
    
  frontend:
    build: ./frontend
    ports: ["3000:3000"]
    env_file: ./frontend/.env.local
    depends_on: [backend]

volumes:
  pgdata:
```

```bash
# Start everything
docker-compose up -d

# Run migrations
docker-compose exec backend npx prisma migrate deploy
```

---

## Cost Estimation (Monthly)

| Service | Free Tier | Paid |
|---------|-----------|------|
| Vercel (Frontend) | Free | $20/mo Pro |
| Railway (Backend) | $5 credit | $10-20/mo |
| Supabase (DB) | 500MB free | $25/mo |
| Upstash (Redis) | 10K req/day | $10/mo |
| Cloudinary | 25 credits/mo | $99/mo |
| Stripe | Free + 2.9% | Same |

**Total estimated: ~$0 (dev) to ~$65-170/mo (production)**
