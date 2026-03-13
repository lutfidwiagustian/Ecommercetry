// ============================================================
// STORE CONTROLLER - Multi-Tenant Store Management
// ============================================================

const { prisma } = require('../lib/prisma');
const { redis } = require('../lib/redis');
const { AppError } = require('../utils/AppError');
const { paginate, getPaginationMeta } = require('../utils/pagination');
const logger = require('../lib/logger');

const CACHE_TTL = 300; // 5 minutes

// ============================================================
// CREATE STORE
// ============================================================

const createStore = async (req, res, next) => {
  try {
    const { storeName, storeSlug, description, email, phone, address } = req.body;
    const userId = req.user.id;
    
    // Check if user already has a store
    const existingStore = await prisma.store.findUnique({ where: { ownerId: userId } });
    if (existingStore) {
      throw new AppError('You already have a store', 409);
    }
    
    // Check slug availability
    const slugTaken = await prisma.store.findUnique({ where: { storeSlug } });
    if (slugTaken) {
      throw new AppError('Store URL is already taken', 409);
    }
    
    // Check subscription limits
    const subscription = await prisma.subscription.findUnique({ where: { userId } });
    if (!subscription || !['ACTIVE', 'TRIALING'].includes(subscription.status)) {
      throw new AppError('Active subscription required to create a store', 403);
    }
    
    const store = await prisma.store.create({
      data: {
        ownerId: userId,
        storeName,
        storeSlug: storeSlug.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
        description,
        email,
        phone,
        address,
        themeConfig: {
          primaryColor: '#6366f1',
          secondaryColor: '#f8fafc',
          fontFamily: 'Inter',
          heroStyle: 'classic',
        }
      }
    });
    
    // Create default categories
    await prisma.category.createMany({
      data: [
        { storeId: store.id, name: 'All Products', slug: 'all', sortOrder: 0 },
        { storeId: store.id, name: 'Featured', slug: 'featured', sortOrder: 1 },
      ]
    });
    
    logger.info(`Store created: ${storeSlug} by user ${userId}`);
    
    res.status(201).json({
      success: true,
      message: 'Store created successfully',
      data: { store }
    });
  } catch (error) {
    next(error);
  }
};

// ============================================================
// GET STORE BY SLUG (Public)
// ============================================================

const getStoreBySlug = async (req, res, next) => {
  try {
    const { slug } = req.params;
    
    // Try cache first
    const cacheKey = `store:slug:${slug}`;
    const cached = await redis.get(cacheKey);
    if (cached) {
      return res.json({ success: true, data: { store: JSON.parse(cached) } });
    }
    
    const store = await prisma.store.findUnique({
      where: { storeSlug: slug, status: 'ACTIVE' },
      include: {
        owner: { select: { name: true, avatar: true } },
        _count: { select: { products: true } }
      }
    });
    
    if (!store) throw new AppError('Store not found', 404);
    
    // Cache it
    await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(store));
    
    res.json({ success: true, data: { store } });
  } catch (error) {
    next(error);
  }
};

// ============================================================
// GET MY STORE (Seller)
// ============================================================

const getMyStore = async (req, res, next) => {
  try {
    const store = await prisma.store.findUnique({
      where: { ownerId: req.user.id },
      include: {
        _count: {
          select: { products: true, orders: true }
        }
      }
    });
    
    if (!store) throw new AppError('Store not found', 404);
    
    res.json({ success: true, data: { store } });
  } catch (error) {
    next(error);
  }
};

// ============================================================
// UPDATE STORE
// ============================================================

const updateStore = async (req, res, next) => {
  try {
    const { storeName, description, logo, banner, email, phone, address, 
            instagram, facebook, twitter, website, themeConfig,
            metaTitle, metaDescription } = req.body;
    
    const store = await prisma.store.findUnique({ where: { ownerId: req.user.id } });
    if (!store) throw new AppError('Store not found', 404);
    
    const updated = await prisma.store.update({
      where: { id: store.id },
      data: {
        storeName,
        description,
        logo,
        banner,
        email,
        phone,
        address,
        instagram,
        facebook,
        twitter,
        website,
        themeConfig: themeConfig ? { ...store.themeConfig, ...themeConfig } : undefined,
        metaTitle,
        metaDescription,
      }
    });
    
    // Invalidate cache
    await redis.del(`store:slug:${store.storeSlug}`);
    
    res.json({ success: true, data: { store: updated } });
  } catch (error) {
    next(error);
  }
};

// ============================================================
// GET ALL STORES (Admin)
// ============================================================

const getAllStores = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, search, status } = req.query;
    const { skip, take } = paginate(page, limit);
    
    const where = {
      ...(search && { storeName: { contains: search, mode: 'insensitive' } }),
      ...(status && { status }),
    };
    
    const [stores, total] = await Promise.all([
      prisma.store.findMany({
        where,
        skip,
        take,
        include: {
          owner: { select: { name: true, email: true } },
          subscription: { select: { plan: true, status: true } },
          _count: { select: { products: true, orders: true } }
        },
        orderBy: { createdAt: 'desc' }
      }),
      prisma.store.count({ where })
    ]);
    
    res.json({
      success: true,
      data: {
        stores,
        pagination: getPaginationMeta(total, page, limit)
      }
    });
  } catch (error) {
    next(error);
  }
};

// ============================================================
// SELLER DASHBOARD ANALYTICS
// ============================================================

const getSellerDashboard = async (req, res, next) => {
  try {
    const store = await prisma.store.findUnique({ where: { ownerId: req.user.id } });
    if (!store) throw new AppError('Store not found', 404);
    
    const storeId = store.id;
    const now = new Date();
    const thirtyDaysAgo = new Date(now.setDate(now.getDate() - 30));
    
    const cacheKey = `dashboard:seller:${storeId}`;
    const cached = await redis.get(cacheKey);
    if (cached) {
      return res.json({ success: true, data: JSON.parse(cached) });
    }
    
    // Run all queries in parallel
    const [
      totalOrders,
      totalRevenue,
      recentOrders,
      topProducts,
      ordersByStatus,
      revenueByDay,
    ] = await Promise.all([
      // Total orders
      prisma.order.count({ where: { storeId, status: { not: 'CANCELLED' } } }),
      
      // Total revenue
      prisma.order.aggregate({
        where: { storeId, paymentStatus: 'COMPLETED' },
        _sum: { totalPrice: true }
      }),
      
      // Recent orders (last 10)
      prisma.order.findMany({
        where: { storeId },
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { name: true, email: true, avatar: true } },
          items: { take: 1, include: { product: { select: { name: true } } } }
        }
      }),
      
      // Top products
      prisma.orderItem.groupBy({
        by: ['productId'],
        where: { order: { storeId, status: { not: 'CANCELLED' } } },
        _sum: { quantity: true, total: true },
        orderBy: { _sum: { total: 'desc' } },
        take: 5,
      }),
      
      // Orders by status
      prisma.order.groupBy({
        by: ['status'],
        where: { storeId },
        _count: true
      }),
      
      // Revenue last 30 days
      prisma.storeAnalytics.findMany({
        where: { storeId, date: { gte: thirtyDaysAgo } },
        orderBy: { date: 'asc' },
        select: { date: true, revenue: true, orders: true, visitors: true }
      })
    ]);
    
    // Get product details for top products
    const productIds = topProducts.map(p => p.productId);
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, name: true, images: { take: 1 }, price: true }
    });
    
    const topProductsWithDetails = topProducts.map(tp => ({
      ...tp,
      product: products.find(p => p.id === tp.productId)
    }));
    
    const dashboardData = {
      stats: {
        totalOrders,
        totalRevenue: totalRevenue._sum.totalPrice || 0,
        totalProducts: await prisma.product.count({ where: { storeId } }),
        totalCustomers: await prisma.order.findMany({
          where: { storeId },
          distinct: ['userId'],
          select: { userId: true }
        }).then(r => r.length),
      },
      recentOrders,
      topProducts: topProductsWithDetails,
      ordersByStatus,
      revenueByDay,
    };
    
    // Cache for 5 minutes
    await redis.setex(cacheKey, 300, JSON.stringify(dashboardData));
    
    res.json({ success: true, data: dashboardData });
  } catch (error) {
    next(error);
  }
};

// ============================================================
// ADMIN DASHBOARD
// ============================================================

const getAdminDashboard = async (req, res, next) => {
  try {
    const cacheKey = 'dashboard:admin';
    const cached = await redis.get(cacheKey);
    if (cached) {
      return res.json({ success: true, data: JSON.parse(cached) });
    }
    
    const [
      totalUsers,
      totalStores,
      totalOrders,
      totalRevenue,
      usersByRole,
      storesByStatus,
      recentStores,
      subscriptionBreakdown,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.store.count(),
      prisma.order.count({ where: { paymentStatus: 'COMPLETED' } }),
      prisma.order.aggregate({
        where: { paymentStatus: 'COMPLETED' },
        _sum: { totalPrice: true }
      }),
      prisma.user.groupBy({ by: ['role'], _count: true }),
      prisma.store.groupBy({ by: ['status'], _count: true }),
      prisma.store.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: { owner: { select: { name: true, email: true } } }
      }),
      prisma.subscription.groupBy({ by: ['plan', 'status'], _count: true }),
    ]);
    
    const data = {
      stats: {
        totalUsers,
        totalStores,
        totalOrders,
        platformRevenue: totalRevenue._sum.totalPrice || 0,
      },
      usersByRole,
      storesByStatus,
      recentStores,
      subscriptionBreakdown,
    };
    
    await redis.setex(cacheKey, 60, JSON.stringify(data));
    
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

// ============================================================
// SUSPEND / RESTORE STORE (Admin)
// ============================================================

const toggleStoreStatus = async (req, res, next) => {
  try {
    const { storeId } = req.params;
    const { status, reason } = req.body;
    
    const store = await prisma.store.findUnique({ where: { id: storeId } });
    if (!store) throw new AppError('Store not found', 404);
    
    const updated = await prisma.store.update({
      where: { id: storeId },
      data: { status }
    });
    
    logger.info(`Store ${storeId} status changed to ${status} by admin ${req.user.id}`);
    
    res.json({ success: true, data: { store: updated } });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createStore,
  getStoreBySlug,
  getMyStore,
  updateStore,
  getAllStores,
  getSellerDashboard,
  getAdminDashboard,
  toggleStoreStatus,
};
