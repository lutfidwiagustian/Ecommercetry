// ============================================================
// PRODUCT CONTROLLER
// ============================================================

const { prisma } = require('../lib/prisma');
const { redis } = require('../lib/redis');
const { AppError } = require('../utils/AppError');
const { paginate, getPaginationMeta } = require('../utils/pagination');
const slugify = require('../utils/slugify');

const CACHE_TTL = 300;

// ============================================================
// CREATE PRODUCT
// ============================================================

const createProduct = async (req, res, next) => {
  try {
    const {
      name, description, price, comparePrice, cost, sku,
      stock, lowStockAlert, categoryId, weight, isActive,
      isFeatured, metaTitle, metaDescription, images = [], variants = []
    } = req.body;
    
    // Get seller's store
    const store = await prisma.store.findUnique({ where: { ownerId: req.user.id } });
    if (!store) throw new AppError('Store not found', 404);
    if (store.status !== 'ACTIVE') throw new AppError('Store is not active', 403);
    
    // Check subscription product limit
    const subscription = await prisma.subscription.findUnique({ where: { userId: req.user.id } });
    const planLimits = { BASIC: 25, PROFESSIONAL: 250, ENTERPRISE: 999999 };
    const maxProducts = planLimits[subscription?.plan] || 25;
    
    const productCount = await prisma.product.count({ where: { storeId: store.id } });
    if (productCount >= maxProducts) {
      throw new AppError(`Product limit reached for your ${subscription?.plan} plan. Upgrade to add more.`, 403);
    }
    
    // Generate unique slug
    let slug = slugify(name);
    const existingSlug = await prisma.product.findUnique({ where: { storeId_slug: { storeId: store.id, slug } } });
    if (existingSlug) slug = `${slug}-${Date.now()}`;
    
    const product = await prisma.product.create({
      data: {
        storeId: store.id,
        categoryId,
        name,
        slug,
        description,
        price,
        comparePrice,
        cost,
        sku,
        stock: stock || 0,
        lowStockAlert: lowStockAlert || 5,
        weight,
        isActive: isActive !== false,
        isFeatured: isFeatured || false,
        metaTitle,
        metaDescription,
        images: {
          create: images.map((url, idx) => ({ url, sortOrder: idx }))
        },
        variants: {
          create: variants.map(v => ({
            name: v.name,
            value: v.value,
            price: v.price,
            stock: v.stock || 0,
            sku: v.sku,
          }))
        }
      },
      include: {
        images: true,
        variants: true,
        category: true,
      }
    });
    
    // Invalidate store products cache
    await redis.del(`products:store:${store.id}`);
    
    res.status(201).json({ success: true, data: { product } });
  } catch (error) {
    next(error);
  }
};

// ============================================================
// GET PRODUCTS (Public - by store)
// ============================================================

const getProductsByStore = async (req, res, next) => {
  try {
    const { slug } = req.params;
    const {
      page = 1, limit = 20, category, search,
      minPrice, maxPrice, sortBy = 'createdAt', order = 'desc',
      featured
    } = req.query;
    
    const store = await prisma.store.findUnique({
      where: { storeSlug: slug, status: 'ACTIVE' }
    });
    if (!store) throw new AppError('Store not found', 404);
    
    const { skip, take } = paginate(page, limit);
    
    const where = {
      storeId: store.id,
      isActive: true,
      ...(category && { category: { slug: category } }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } }
        ]
      }),
      ...(minPrice || maxPrice ? {
        price: {
          ...(minPrice && { gte: parseFloat(minPrice) }),
          ...(maxPrice && { lte: parseFloat(maxPrice) })
        }
      } : {}),
      ...(featured === 'true' && { isFeatured: true }),
    };
    
    const validSortFields = ['createdAt', 'price', 'totalSold', 'avgRating', 'name'];
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'createdAt';
    
    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        skip,
        take,
        orderBy: { [sortField]: order },
        include: {
          images: { take: 1, orderBy: { sortOrder: 'asc' } },
          category: { select: { name: true, slug: true } },
          _count: { select: { reviews: true } }
        }
      }),
      prisma.product.count({ where })
    ]);
    
    res.json({
      success: true,
      data: {
        products,
        pagination: getPaginationMeta(total, page, limit)
      }
    });
  } catch (error) {
    next(error);
  }
};

// ============================================================
// GET SINGLE PRODUCT
// ============================================================

const getProductBySlug = async (req, res, next) => {
  try {
    const { storeSlug, productSlug } = req.params;
    
    const cacheKey = `product:${storeSlug}:${productSlug}`;
    const cached = await redis.get(cacheKey);
    if (cached) {
      return res.json({ success: true, data: { product: JSON.parse(cached) } });
    }
    
    const product = await prisma.product.findFirst({
      where: {
        slug: productSlug,
        isActive: true,
        store: { storeSlug, status: 'ACTIVE' }
      },
      include: {
        images: { orderBy: { sortOrder: 'asc' } },
        variants: true,
        category: { select: { name: true, slug: true } },
        reviews: {
          where: { isVisible: true },
          take: 10,
          orderBy: { createdAt: 'desc' },
          include: {
            user: { select: { name: true, avatar: true } }
          }
        },
        store: {
          select: { storeName: true, storeSlug: true, logo: true }
        }
      }
    });
    
    if (!product) throw new AppError('Product not found', 404);
    
    await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(product));
    
    res.json({ success: true, data: { product } });
  } catch (error) {
    next(error);
  }
};

// ============================================================
// UPDATE PRODUCT (Seller)
// ============================================================

const updateProduct = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const store = await prisma.store.findUnique({ where: { ownerId: req.user.id } });
    if (!store) throw new AppError('Store not found', 404);
    
    // Verify product belongs to seller's store
    const product = await prisma.product.findFirst({
      where: { id, storeId: store.id }
    });
    if (!product) throw new AppError('Product not found', 404);
    
    const {
      name, description, price, comparePrice, cost, sku,
      stock, categoryId, isActive, isFeatured, images, variants
    } = req.body;
    
    // Update slug if name changed
    let slug = product.slug;
    if (name && name !== product.name) {
      slug = slugify(name);
      const existing = await prisma.product.findFirst({
        where: { storeId: store.id, slug, id: { not: id } }
      });
      if (existing) slug = `${slug}-${Date.now()}`;
    }
    
    const updated = await prisma.product.update({
      where: { id },
      data: {
        name, slug, description, price, comparePrice, cost, sku,
        stock, categoryId, isActive, isFeatured,
        ...(images && {
          images: {
            deleteMany: {},
            create: images.map((url, idx) => ({ url, sortOrder: idx }))
          }
        }),
        ...(variants && {
          variants: {
            deleteMany: {},
            create: variants.map(v => ({
              name: v.name, value: v.value, price: v.price,
              stock: v.stock || 0, sku: v.sku
            }))
          }
        })
      },
      include: { images: true, variants: true, category: true }
    });
    
    // Invalidate caches
    await Promise.all([
      redis.del(`products:store:${store.id}`),
      redis.del(`product:${store.storeSlug}:${product.slug}`),
    ]);
    
    res.json({ success: true, data: { product: updated } });
  } catch (error) {
    next(error);
  }
};

// ============================================================
// DELETE PRODUCT
// ============================================================

const deleteProduct = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const store = await prisma.store.findUnique({ where: { ownerId: req.user.id } });
    if (!store) throw new AppError('Store not found', 404);
    
    const product = await prisma.product.findFirst({ where: { id, storeId: store.id } });
    if (!product) throw new AppError('Product not found', 404);
    
    await prisma.product.delete({ where: { id } });
    
    await redis.del(`products:store:${store.id}`);
    await redis.del(`product:${store.storeSlug}:${product.slug}`);
    
    res.json({ success: true, message: 'Product deleted' });
  } catch (error) {
    next(error);
  }
};

// ============================================================
// GET SELLER PRODUCTS
// ============================================================

const getSellerProducts = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, search, category, status } = req.query;
    
    const store = await prisma.store.findUnique({ where: { ownerId: req.user.id } });
    if (!store) throw new AppError('Store not found', 404);
    
    const { skip, take } = paginate(page, limit);
    
    const where = {
      storeId: store.id,
      ...(search && { name: { contains: search, mode: 'insensitive' } }),
      ...(category && { category: { slug: category } }),
      ...(status === 'active' && { isActive: true }),
      ...(status === 'inactive' && { isActive: false }),
      ...(status === 'low_stock' && { stock: { lte: 5 } }),
    };
    
    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where, skip, take,
        orderBy: { createdAt: 'desc' },
        include: {
          images: { take: 1 },
          category: { select: { name: true } },
          _count: { select: { orderItems: true, reviews: true } }
        }
      }),
      prisma.product.count({ where })
    ]);
    
    res.json({
      success: true,
      data: { products, pagination: getPaginationMeta(total, page, limit) }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createProduct,
  getProductsByStore,
  getProductBySlug,
  updateProduct,
  deleteProduct,
  getSellerProducts,
};
