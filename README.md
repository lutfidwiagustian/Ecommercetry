# ShopForge — Multi-Tenant SaaS E-Commerce Platform

> A production-grade, scalable SaaS e-commerce platform built with Next.js, Node.js, PostgreSQL, and Redis. One platform, infinite stores.

---

## 📁 Project Structure

```
shopforge/
├── backend/                        # Node.js + Express API
│   ├── prisma/
│   │   ├── schema.prisma           # Complete database schema (15 models)
│   │   └── seed.js                 # Database seeder
│   ├── src/
│   │   ├── index.js                # Server entry point
│   │   ├── controllers/
│   │   │   ├── authController.js   # Register, Login, Refresh, Logout
│   │   │   ├── storeController.js  # Store CRUD + Dashboard analytics
│   │   │   ├── productController.js # Products + Variants + Images
│   │   │   └── orderController.js  # Checkout flow + Order management
│   │   ├── middleware/
│   │   │   ├── auth.js             # JWT auth + Role guards
│   │   │   ├── errorHandler.js     # Global error handler
│   │   │   ├── notFound.js         # 404 handler
│   │   │   └── validate.js         # Request validation
│   │   ├── routes/
│   │   │   ├── index.js            # Route aggregator
│   │   │   ├── authRoutes.js       # /auth/*
│   │   │   ├── storeRoutes.js      # /stores/*
│   │   │   ├── productRoutes.js    # /products/*
│   │   │   ├── orderRoutes.js      # /orders/*
│   │   │   ├── cartRoutes.js       # /cart/*
│   │   │   ├── reviewRoutes.js     # /reviews/*
│   │   │   ├── categoryRoutes.js   # /categories/*
│   │   │   ├── subscriptionRoutes.js # /subscriptions/*
│   │   │   ├── uploadRoutes.js     # /upload/*
│   │   │   ├── wishlistRoutes.js   # /wishlist/*
│   │   │   ├── couponRoutes.js     # /coupons/*
│   │   │   └── adminRoutes.js      # /admin/*
│   │   ├── services/
│   │   │   ├── emailService.js     # Nodemailer email service
│   │   │   ├── stripeService.js    # Stripe payment service
│   │   │   └── analyticsService.js # Analytics aggregation
│   │   ├── jobs/
│   │   │   ├── orderQueue.js       # BullMQ order job queue
│   │   │   └── workers/
│   │   │       ├── orderWorker.js  # Order notification worker
│   │   │       └── emailWorker.js  # Email sending worker
│   │   ├── lib/
│   │   │   ├── prisma.js           # Prisma singleton client
│   │   │   ├── redis.js            # Redis connection
│   │   │   ├── stripe.js           # Stripe client
│   │   │   ├── cloudinary.js       # Cloudinary config
│   │   │   └── logger.js           # Winston logger
│   │   ├── validators/
│   │   │   ├── authValidator.js    # Joi/Zod auth schemas
│   │   │   └── productValidator.js # Product validation schemas
│   │   └── utils/
│   │       ├── AppError.js         # Custom error class
│   │       ├── pagination.js       # Pagination helpers
│   │       └── slugify.js          # URL slug generator
│   ├── .env.example                # Environment variables template
│   └── package.json
│
├── frontend/                       # Next.js 14 App Router
│   ├── src/
│   │   ├── app/
│   │   │   ├── layout.tsx          # Root layout + providers
│   │   │   ├── page.tsx            # Homepage
│   │   │   ├── (auth)/
│   │   │   │   ├── login/          # Login page
│   │   │   │   └── register/       # Register page
│   │   │   ├── dashboard/
│   │   │   │   ├── page.tsx        # Seller dashboard overview
│   │   │   │   ├── products/       # Product management
│   │   │   │   ├── orders/         # Order management
│   │   │   │   ├── analytics/      # Analytics page
│   │   │   │   ├── settings/       # Store settings
│   │   │   │   └── subscription/   # Plan management
│   │   │   ├── admin/
│   │   │   │   ├── page.tsx        # Admin dashboard
│   │   │   │   ├── stores/         # Store management
│   │   │   │   └── users/          # User management
│   │   │   └── store/
│   │   │       └── [slug]/
│   │   │           ├── page.tsx    # Store homepage
│   │   │           ├── products/   # Product listing
│   │   │           └── [product]/  # Product detail
│   │   ├── components/
│   │   │   ├── ui/                 # Base components (Button, Input, etc.)
│   │   │   ├── layout/
│   │   │   │   ├── Navbar.tsx      # Main navigation
│   │   │   │   ├── Sidebar.tsx     # Dashboard sidebar
│   │   │   │   └── Footer.tsx      # Site footer
│   │   │   ├── store/
│   │   │   │   ├── ProductCard.tsx
│   │   │   │   ├── ProductGrid.tsx
│   │   │   │   ├── ProductFilters.tsx
│   │   │   │   └── StoreHeader.tsx
│   │   │   ├── cart/
│   │   │   │   ├── CartDrawer.tsx
│   │   │   │   ├── CartItem.tsx
│   │   │   │   └── CheckoutForm.tsx
│   │   │   ├── dashboard/
│   │   │   │   ├── StatsCards.tsx
│   │   │   │   ├── RevenueChart.tsx
│   │   │   │   ├── OrdersTable.tsx
│   │   │   │   └── TopProducts.tsx
│   │   │   └── auth/
│   │   │       ├── LoginForm.tsx
│   │   │       └── RegisterForm.tsx
│   │   ├── lib/
│   │   │   ├── api.ts              # Axios API client + all endpoints
│   │   │   └── utils.ts            # Helper functions
│   │   ├── store/
│   │   │   └── index.ts            # Zustand stores (auth + cart)
│   │   ├── hooks/
│   │   │   ├── useAuth.ts          # Auth hook
│   │   │   ├── useCart.ts          # Cart operations hook
│   │   │   ├── useProducts.ts      # TanStack Query product hooks
│   │   │   └── useOrders.ts        # Order hooks
│   │   └── types/
│   │       └── index.ts            # TypeScript type definitions
│   ├── platform-ui.html            # 🎨 Complete platform UI demo
│   ├── next.config.js
│   ├── tailwind.config.js
│   └── package.json
│
└── docs/
    ├── README.md                   # This file
    ├── API_DOCUMENTATION.md        # Complete API reference
    └── DEPLOYMENT_GUIDE.md         # Production deployment guide
```

---

## 🚀 Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14, React 18, TypeScript |
| Styling | Tailwind CSS, Framer Motion |
| State | Zustand, TanStack Query |
| Backend | Node.js, Express.js |
| Database | PostgreSQL + Prisma ORM |
| Cache | Redis (ioredis) |
| Queue | BullMQ |
| Auth | JWT + Refresh Tokens |
| Payments | Stripe |
| Storage | Cloudinary / AWS S3 |
| Email | Nodemailer + SMTP |
| Validation | Zod, Joi |
| Security | Helmet.js, express-rate-limit |

---

## 🗃️ Database Schema (15 Models)

```
Users ──────────── Store ──────────── Products
  │                  │                    │
  ├── RefreshToken   ├── Categories       ├── ProductImages
  ├── Addresses      ├── Coupons          ├── ProductVariants
  ├── Cart ──── CartItems                 ├── OrderItems
  ├── Orders ─────────────────────────────┘
  │     └── OrderTimeline
  ├── Reviews
  ├── Wishlist
  ├── Subscription
  └── Notifications
```

---

## 🔐 Auth Flow

```
1. POST /auth/register → returns accessToken (15min) + sets refreshToken cookie (7d)
2. POST /auth/login → same
3. On 401 → POST /auth/refresh → new accessToken
4. POST /auth/logout → blacklists token in Redis + clears cookie
```

---

## 🏗️ Multi-Tenancy

Each store is isolated by `storeId`. Sellers access only their own:
- Products (`storeId` filter)
- Orders (`storeId` filter)
- Analytics (`storeId` filter)
- Categories, Coupons

Store URL patterns:
- Path-based: `shopforge.io/store/mybrand`
- Subdomain: `mybrand.shopforge.io` (DNS wildcard required)

---

## 📋 API Endpoints (35+ endpoints)

| Method | Path | Role | Description |
|--------|------|------|-------------|
| POST | /auth/register | Public | Register user |
| POST | /auth/login | Public | Login |
| POST | /auth/refresh | Public | Refresh token |
| POST | /stores | Seller | Create store |
| GET | /stores/:slug | Public | Get store |
| GET | /stores/my/dashboard | Seller | Analytics |
| POST | /products | Seller | Create product |
| GET | /products/store/:slug | Public | List products |
| GET | /cart | Customer | Get cart |
| POST | /cart/items | Customer | Add to cart |
| POST | /orders | Customer | Checkout |
| GET | /orders/my | Customer | My orders |
| PATCH | /orders/:id/status | Seller | Update status |
| POST | /reviews | Customer | Add review |
| POST | /coupons | Seller | Create coupon |
| POST | /coupons/validate | Customer | Validate coupon |
| GET | /subscriptions/plans | Public | Get plans |
| POST | /subscriptions/upgrade | Seller | Upgrade plan |
| POST | /upload/image | Auth | Upload image |
| GET | /admin/users | Admin | Manage users |

---

## 💰 Subscription Plans

| Feature | Basic | Professional | Enterprise |
|---------|-------|-------------|------------|
| Price | Rp 99K/mo | Rp 299K/mo | Rp 799K/mo |
| Products | 25 | 250 | Unlimited |
| Transaction Fee | 2% | 1% | 0% |
| Analytics | Basic | Advanced | Full Suite |
| Support | Email | Priority | 24/7 Dedicated |
| Coupons | ❌ | ✅ | ✅ |
| API Access | ❌ | ❌ | ✅ |
| White Label | ❌ | ❌ | ✅ |

---

## 🎯 Roadmap

- [ ] Elasticsearch product search
- [ ] Real-time notifications via WebSockets
- [ ] Mobile app (React Native)
- [ ] Affiliate/referral system
- [ ] Multi-currency support
- [ ] Advanced SEO tools
- [ ] Abandoned cart recovery
- [ ] A/B testing for store themes
# Ecommercetry
