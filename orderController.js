// ============================================================
// ORDER CONTROLLER
// ============================================================

const { prisma } = require('../lib/prisma');
const { redis } = require('../lib/redis');
const { AppError } = require('../utils/AppError');
const { paginate, getPaginationMeta } = require('../utils/pagination');
const { orderQueue } = require('../jobs/orderQueue');
const stripe = require('../lib/stripe');
const logger = require('../lib/logger');

// ============================================================
// CHECKOUT / CREATE ORDER
// ============================================================

const createOrder = async (req, res, next) => {
  try {
    const { storeSlug, addressId, couponCode, notes, paymentMethod } = req.body;
    const userId = req.user.id;
    
    // Get store
    const store = await prisma.store.findUnique({
      where: { storeSlug, status: 'ACTIVE' }
    });
    if (!store) throw new AppError('Store not found', 404);
    
    // Get cart
    const cart = await prisma.cart.findUnique({
      where: { userId },
      include: {
        items: {
          include: {
            product: { include: { images: { take: 1 } } },
            variant: true
          }
        }
      }
    });
    
    if (!cart || cart.items.length === 0) {
      throw new AppError('Cart is empty', 400);
    }
    
    // Filter items belonging to this store
    const storeItems = cart.items.filter(item => item.product.storeId === store.id);
    if (storeItems.length === 0) {
      throw new AppError('No items from this store in cart', 400);
    }
    
    // Validate stock and calculate totals
    let subtotal = 0;
    const orderItemsData = [];
    
    for (const cartItem of storeItems) {
      const { product, variant, quantity } = cartItem;
      
      if (!product.isActive) {
        throw new AppError(`${product.name} is no longer available`, 400);
      }
      
      const availableStock = variant ? variant.stock : product.stock;
      if (availableStock < quantity) {
        throw new AppError(`Insufficient stock for ${product.name}`, 400);
      }
      
      const itemPrice = variant?.price || product.price;
      const itemTotal = Number(itemPrice) * quantity;
      subtotal += itemTotal;
      
      orderItemsData.push({
        productId: product.id,
        variantId: variant?.id,
        name: product.name,
        image: product.images[0]?.url,
        quantity,
        price: itemPrice,
        total: itemTotal,
      });
    }
    
    // Apply coupon
    let discount = 0;
    let coupon = null;
    
    if (couponCode) {
      coupon = await prisma.coupon.findUnique({
        where: { storeId_code: { storeId: store.id, code: couponCode.toUpperCase() } }
      });
      
      if (!coupon || !coupon.isActive) throw new AppError('Invalid coupon code', 400);
      if (coupon.expiresAt && coupon.expiresAt < new Date()) throw new AppError('Coupon expired', 400);
      if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) throw new AppError('Coupon usage limit reached', 400);
      if (coupon.minimumPurchase && subtotal < Number(coupon.minimumPurchase)) {
        throw new AppError(`Minimum purchase of ${coupon.minimumPurchase} required`, 400);
      }
      
      if (coupon.discountType === 'PERCENTAGE') {
        discount = subtotal * (Number(coupon.discountValue) / 100);
        if (coupon.maximumDiscount) {
          discount = Math.min(discount, Number(coupon.maximumDiscount));
        }
      } else {
        discount = Number(coupon.discountValue);
      }
    }
    
    const shippingCost = 0; // TODO: shipping calculation
    const tax = 0; // TODO: tax calculation
    const totalPrice = subtotal - discount + shippingCost + tax;
    
    // Generate order number
    const orderNumber = `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 4).toUpperCase()}`;
    
    // Create order in transaction
    const order = await prisma.$transaction(async (tx) => {
      // Create order
      const newOrder = await tx.order.create({
        data: {
          orderNumber,
          userId,
          storeId: store.id,
          addressId,
          subtotal,
          shippingCost,
          discount,
          tax,
          totalPrice,
          couponId: coupon?.id,
          couponCode: coupon?.code,
          notes,
          paymentMethod,
          items: { create: orderItemsData }
        },
        include: {
          items: { include: { product: true } },
          address: true,
        }
      });
      
      // Update stock
      for (const item of orderItemsData) {
        if (item.variantId) {
          await tx.productVariant.update({
            where: { id: item.variantId },
            data: { stock: { decrement: item.quantity } }
          });
        } else {
          await tx.product.update({
            where: { id: item.productId },
            data: {
              stock: { decrement: item.quantity },
              totalSold: { increment: item.quantity }
            }
          });
        }
      }
      
      // Update coupon usage
      if (coupon) {
        await tx.coupon.update({
          where: { id: coupon.id },
          data: { usedCount: { increment: 1 } }
        });
      }
      
      // Remove items from cart
      await tx.cartItem.deleteMany({
        where: { cartId: cart.id, productId: { in: storeItems.map(i => i.productId) } }
      });
      
      // Add order timeline
      await tx.orderTimeline.create({
        data: { orderId: newOrder.id, status: 'PENDING', message: 'Order placed successfully' }
      });
      
      return newOrder;
    });
    
    // Stripe payment intent (simulation)
    let paymentIntent = null;
    if (paymentMethod === 'stripe') {
      paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(totalPrice * 100), // cents
        currency: 'idr',
        metadata: { orderId: order.id },
      });
    }
    
    // Queue notifications
    await orderQueue.add('send-order-confirmation', {
      orderId: order.id,
      userId,
      storeId: store.id,
    });
    
    logger.info(`Order created: ${orderNumber}`);
    
    res.status(201).json({
      success: true,
      data: {
        order,
        paymentIntent: paymentIntent ? {
          clientSecret: paymentIntent.client_secret
        } : null
      }
    });
  } catch (error) {
    next(error);
  }
};

// ============================================================
// GET ORDERS (Customer)
// ============================================================

const getMyOrders = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, status } = req.query;
    const { skip, take } = paginate(page, limit);
    
    const where = {
      userId: req.user.id,
      ...(status && { status })
    };
    
    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where, skip, take,
        orderBy: { createdAt: 'desc' },
        include: {
          store: { select: { storeName: true, storeSlug: true, logo: true } },
          items: {
            include: {
              product: { include: { images: { take: 1 } } }
            }
          }
        }
      }),
      prisma.order.count({ where })
    ]);
    
    res.json({
      success: true,
      data: { orders, pagination: getPaginationMeta(total, page, limit) }
    });
  } catch (error) {
    next(error);
  }
};

// ============================================================
// GET SINGLE ORDER
// ============================================================

const getOrderById = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        user: { select: { name: true, email: true } },
        store: { select: { storeName: true, storeSlug: true, logo: true } },
        address: true,
        items: {
          include: {
            product: { include: { images: { take: 1 } } },
            variant: true,
          }
        },
        timeline: { orderBy: { createdAt: 'asc' } }
      }
    });
    
    if (!order) throw new AppError('Order not found', 404);
    
    // Authorization check
    const isOwner = order.userId === req.user.id;
    const isStoreOwner = order.store && 
      await prisma.store.findFirst({ where: { id: order.storeId, ownerId: req.user.id } });
    const isAdmin = req.user.role === 'ADMIN';
    
    if (!isOwner && !isStoreOwner && !isAdmin) {
      throw new AppError('Unauthorized', 403);
    }
    
    res.json({ success: true, data: { order } });
  } catch (error) {
    next(error);
  }
};

// ============================================================
// GET STORE ORDERS (Seller)
// ============================================================

const getStoreOrders = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, status, search } = req.query;
    const { skip, take } = paginate(page, limit);
    
    const store = await prisma.store.findUnique({ where: { ownerId: req.user.id } });
    if (!store) throw new AppError('Store not found', 404);
    
    const where = {
      storeId: store.id,
      ...(status && { status }),
      ...(search && {
        OR: [
          { orderNumber: { contains: search, mode: 'insensitive' } },
          { user: { name: { contains: search, mode: 'insensitive' } } }
        ]
      })
    };
    
    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where, skip, take,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { name: true, email: true, avatar: true } },
          items: {
            include: { product: { include: { images: { take: 1 } } } }
          }
        }
      }),
      prisma.order.count({ where })
    ]);
    
    res.json({
      success: true,
      data: { orders, pagination: getPaginationMeta(total, page, limit) }
    });
  } catch (error) {
    next(error);
  }
};

// ============================================================
// UPDATE ORDER STATUS (Seller/Admin)
// ============================================================

const updateOrderStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, trackingNumber, message } = req.body;
    
    const order = await prisma.order.findUnique({
      where: { id },
      include: { store: true }
    });
    
    if (!order) throw new AppError('Order not found', 404);
    
    // Check permission
    const isStoreOwner = order.store.ownerId === req.user.id;
    const isAdmin = req.user.role === 'ADMIN';
    if (!isStoreOwner && !isAdmin) throw new AppError('Unauthorized', 403);
    
    const updated = await prisma.$transaction(async (tx) => {
      const updatedOrder = await tx.order.update({
        where: { id },
        data: {
          status,
          ...(trackingNumber && { trackingNumber })
        }
      });
      
      await tx.orderTimeline.create({
        data: {
          orderId: id,
          status,
          message: message || `Order ${status.toLowerCase()}`
        }
      });
      
      return updatedOrder;
    });
    
    // Queue notification
    await orderQueue.add('send-status-update', {
      orderId: id,
      status,
      userId: order.userId,
    });
    
    res.json({ success: true, data: { order: updated } });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createOrder,
  getMyOrders,
  getOrderById,
  getStoreOrders,
  updateOrderStatus,
};
