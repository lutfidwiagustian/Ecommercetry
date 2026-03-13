# ShopForge API Documentation
## Version 1.0.0 | REST API

Base URL: `https://api.shopforge.io/api/v1`

---

## Authentication

All protected endpoints require `Authorization: Bearer <accessToken>` header.

Access tokens expire in **15 minutes**. Use refresh endpoint to get new tokens.
Refresh tokens are stored as httpOnly cookies and expire in **7 days**.

---

## 🔐 Auth Endpoints

### POST /auth/register
Register a new user.

**Body:**
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "SecurePass123!",
  "role": "SELLER" // SELLER | CUSTOMER
}
```

**Response 201:**
```json
{
  "success": true,
  "data": {
    "user": { "id": "clx...", "name": "John Doe", "email": "john@example.com", "role": "SELLER" },
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

---

### POST /auth/login
Login with email and password.

**Body:**
```json
{ "email": "john@example.com", "password": "SecurePass123!" }
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "clx...", "name": "John", "email": "john@example.com",
      "role": "SELLER", "avatar": null,
      "store": { "id": "clx...", "storeName": "My Store", "storeSlug": "my-store" },
      "subscription": { "plan": "PROFESSIONAL", "status": "ACTIVE" }
    },
    "accessToken": "eyJ..."
  }
}
```

---

### POST /auth/refresh
Refresh access token using httpOnly cookie.

**Response 200:**
```json
{ "success": true, "data": { "accessToken": "eyJ..." } }
```

---

### POST /auth/logout
`🔒 Auth Required`

Invalidates refresh token and blacklists access token.

---

### GET /auth/me
`🔒 Auth Required`

Get current user profile.

---

### PUT /auth/me
`🔒 Auth Required`

Update profile (name, phone, avatar).

---

## 🏪 Store Endpoints

### POST /stores
`🔒 Auth Required | Role: SELLER`

Create a new store (one per seller).

**Body:**
```json
{
  "storeName": "Toko Baju Keren",
  "storeSlug": "toko-baju-keren",
  "description": "Fashion terbaik untuk semua",
  "email": "toko@email.com",
  "phone": "08123456789"
}
```

---

### GET /stores/:slug
Public. Get store by slug.

**Response:**
```json
{
  "success": true,
  "data": {
    "store": {
      "id": "clx...", "storeName": "Toko Baju Keren",
      "storeSlug": "toko-baju-keren", "logo": "https://...",
      "description": "...", "status": "ACTIVE",
      "themeConfig": { "primaryColor": "#6366f1" },
      "_count": { "products": 84 }
    }
  }
}
```

---

### GET /stores/my/store
`🔒 Auth Required | Role: SELLER`

Get seller's own store.

---

### PUT /stores/my/store
`🔒 Auth Required | Role: SELLER`

Update store settings including theme config.

**Body:**
```json
{
  "storeName": "New Name",
  "logo": "https://cloudinary.com/...",
  "themeConfig": { "primaryColor": "#7c3aed" },
  "instagram": "@tokosaya"
}
```

---

### GET /stores/my/dashboard
`🔒 Auth Required | Role: SELLER`

Get seller dashboard analytics.

**Response:**
```json
{
  "success": true,
  "data": {
    "stats": {
      "totalOrders": 348,
      "totalRevenue": "24800000",
      "totalProducts": 84,
      "totalCustomers": 1240
    },
    "recentOrders": [...],
    "topProducts": [...],
    "ordersByStatus": [...],
    "revenueByDay": [...]
  }
}
```

---

## 📦 Product Endpoints

### POST /products
`🔒 Auth Required | Role: SELLER`

Create a product. Checks subscription product limit.

**Body:**
```json
{
  "name": "Kaos Polos Premium",
  "description": "Bahan cotton combed 30s",
  "price": 89000,
  "comparePrice": 120000,
  "stock": 142,
  "categoryId": "clx...",
  "images": ["https://cloudinary.com/img1.jpg"],
  "variants": [
    { "name": "Size", "value": "S", "stock": 40 },
    { "name": "Size", "value": "M", "stock": 60 },
    { "name": "Size", "value": "L", "stock": 42 }
  ]
}
```

---

### GET /products/store/:storeSlug
Public. Get products for a store with filtering.

**Query Params:**
- `page` (default: 1)
- `limit` (default: 20, max: 100)
- `category` (category slug)
- `search` (full-text search)
- `minPrice`, `maxPrice`
- `sortBy`: createdAt | price | totalSold | avgRating | name
- `order`: asc | desc
- `featured`: true

---

### GET /products/store/:storeSlug/:productSlug
Public. Get single product with reviews and variants.

---

### PUT /products/:id
`🔒 Auth Required | Role: SELLER`

Update product. Only owner can update.

---

### DELETE /products/:id
`🔒 Auth Required | Role: SELLER`

Delete product.

---

### GET /products/seller/mine
`🔒 Auth Required | Role: SELLER`

Get all products for seller with filtering.

**Query Params:**
- `status`: active | inactive | low_stock

---

## 🛒 Cart Endpoints

### GET /cart
`🔒 Auth Required`

Get current user's cart with product details.

---

### POST /cart/items
`🔒 Auth Required`

Add item to cart. Auto-increments if exists.

**Body:**
```json
{ "productId": "clx...", "variantId": "clx...", "quantity": 1 }
```

---

### PUT /cart/items/:itemId
`🔒 Auth Required`

Update cart item quantity. Set to 0 to remove.

---

### DELETE /cart/items/:itemId
`🔒 Auth Required`

Remove item from cart.

---

### DELETE /cart
`🔒 Auth Required`

Clear entire cart.

---

## 📋 Order Endpoints

### POST /orders
`🔒 Auth Required`

Create order / checkout. Validates stock, applies coupon, creates Stripe payment intent.

**Body:**
```json
{
  "storeSlug": "toko-baju-keren",
  "addressId": "clx...",
  "couponCode": "SAVE20",
  "notes": "Tolong bungkus rapi",
  "paymentMethod": "stripe"
}
```

**Response 201:**
```json
{
  "success": true,
  "data": {
    "order": {
      "id": "clx...", "orderNumber": "ORD-1703123456789-AB12",
      "status": "PENDING", "totalPrice": "267200",
      "items": [...]
    },
    "paymentIntent": {
      "clientSecret": "pi_3O9XWG2eZvKYlo2C1LHVL9zz_secret_..."
    }
  }
}
```

---

### GET /orders/my
`🔒 Auth Required`

Get customer's orders.

**Query Params:** `page`, `limit`, `status`

---

### GET /orders/:id
`🔒 Auth Required`

Get single order. Access controlled: owner, store owner, or admin only.

---

### GET /orders/store/all
`🔒 Auth Required | Role: SELLER`

Get all orders for seller's store.

**Query Params:** `page`, `limit`, `status`, `search`

---

### PATCH /orders/:id/status
`🔒 Auth Required | Role: SELLER | ADMIN`

Update order status.

**Body:**
```json
{
  "status": "SHIPPED",
  "trackingNumber": "JNE123456789",
  "message": "Paket telah dikirim via JNE"
}
```

**Valid statuses:** PENDING → CONFIRMED → PROCESSING → SHIPPED → DELIVERED | CANCELLED

---

## ⭐ Review Endpoints

### POST /reviews
`🔒 Auth Required`

Create or update product review (upsert by userId+productId).

**Body:**
```json
{ "productId": "clx...", "rating": 5, "comment": "Produk sangat bagus!", "images": [] }
```

---

### GET /reviews/product/:productId
Public. Get all reviews for a product.

---

## 🏷️ Coupon Endpoints

### POST /coupons
`🔒 Auth Required | Role: SELLER`

Create a coupon.

**Body:**
```json
{
  "code": "SAVE20",
  "discountType": "PERCENTAGE",
  "discountValue": 20,
  "minimumPurchase": 100000,
  "usageLimit": 100,
  "expiresAt": "2024-12-31T23:59:59Z"
}
```

---

### POST /coupons/validate
`🔒 Auth Required`

Validate coupon and calculate discount.

**Body:**
```json
{ "code": "SAVE20", "storeSlug": "toko-baju-keren", "subtotal": 267200 }
```

---

## 💳 Subscription Endpoints

### GET /subscriptions/plans
Public. Get all available plans with features and pricing.

---

### GET /subscriptions/my
`🔒 Auth Required`

Get current user's subscription.

---

### POST /subscriptions/upgrade
`🔒 Auth Required`

Upgrade subscription plan.

**Body:**
```json
{ "plan": "PROFESSIONAL", "billingCycle": "MONTHLY" }
```

---

## 📤 Upload Endpoints

### POST /upload/image
`🔒 Auth Required`

Upload single image to Cloudinary.

**Body:** `multipart/form-data` with `image` field.

**Response:**
```json
{ "success": true, "data": { "url": "https://res.cloudinary.com/...", "publicId": "shopforge/..." } }
```

---

### POST /upload/images
`🔒 Auth Required`

Upload up to 10 images at once.

---

## ❤️ Wishlist Endpoints

### GET /wishlist
`🔒 Auth Required`

Get user's wishlist.

---

### POST /wishlist/:productId
`🔒 Auth Required`

Toggle product in/out of wishlist.

---

## 🛡️ Admin Endpoints

All admin endpoints require `Role: ADMIN`.

### GET /admin/users
List all users with filtering. Params: `page`, `limit`, `search`, `role`.

### PATCH /admin/users/:id/status
Activate or suspend a user.
**Body:** `{ "isActive": false }`

### GET /stores/admin/all
List all stores.

### GET /stores/admin/dashboard
Platform-wide analytics.

### PATCH /stores/admin/:storeId/status
Suspend or restore a store.
**Body:** `{ "status": "SUSPENDED", "reason": "Policy violation" }`

---

## Error Responses

All errors follow this format:

```json
{
  "success": false,
  "error": {
    "message": "Human-readable error message"
  }
}
```

**HTTP Status Codes:**
- `400` Bad Request (validation error)
- `401` Unauthorized (no/invalid token)
- `403` Forbidden (insufficient permissions)
- `404` Not Found
- `409` Conflict (duplicate data)
- `429` Too Many Requests (rate limited)
- `500` Internal Server Error

---

## Rate Limits

- General API: **100 requests / 15 minutes** per IP
- Auth endpoints: **10 requests / 15 minutes** per IP

---

## Pagination

All list endpoints support pagination:

```json
{
  "data": {
    "items": [...],
    "pagination": {
      "total": 248,
      "page": 1,
      "limit": 20,
      "totalPages": 13,
      "hasNext": true,
      "hasPrev": false
    }
  }
}
```
