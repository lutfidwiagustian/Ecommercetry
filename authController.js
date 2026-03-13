// ============================================================
// AUTH CONTROLLER
// ============================================================

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { prisma } = require('../lib/prisma');
const { redis } = require('../lib/redis');
const { AppError } = require('../utils/AppError');
const { sendEmail } = require('../services/emailService');
const logger = require('../lib/logger');

const SALT_ROUNDS = 12;

// ============================================================
// HELPERS
// ============================================================

const generateTokens = (userId) => {
  const accessToken = jwt.sign(
    { userId, type: 'access' },
    process.env.JWT_SECRET,
    { expiresIn: '15m' }
  );
  
  const refreshToken = jwt.sign(
    { userId, type: 'refresh', jti: uuidv4() },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: '7d' }
  );
  
  return { accessToken, refreshToken };
};

const setRefreshTokenCookie = (res, token) => {
  res.cookie('refreshToken', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });
};

// ============================================================
// REGISTER
// ============================================================

const register = async (req, res, next) => {
  try {
    const { name, email, password, role = 'CUSTOMER' } = req.body;
    
    // Check existing user
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new AppError('Email already registered', 409);
    }
    
    // Validate role (only CUSTOMER and SELLER allowed on register)
    const allowedRoles = ['CUSTOMER', 'SELLER'];
    if (!allowedRoles.includes(role)) {
      throw new AppError('Invalid role', 400);
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
    
    // Create user
    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
      }
    });
    
    // Create subscription for sellers (BASIC trial)
    if (role === 'SELLER') {
      const trialEndDate = new Date();
      trialEndDate.setDate(trialEndDate.getDate() + 14);
      
      await prisma.subscription.create({
        data: {
          userId: user.id,
          plan: 'BASIC',
          status: 'TRIALING',
          price: 0,
          trialEndsAt: trialEndDate,
        }
      });
    }
    
    // Create empty cart for customers
    if (role === 'CUSTOMER') {
      await prisma.cart.create({ data: { userId: user.id } });
    }
    
    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(user.id);
    
    // Store refresh token
    await prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      }
    });
    
    setRefreshTokenCookie(res, refreshToken);
    
    // Send welcome email (async, don't await)
    sendEmail({
      to: email,
      subject: 'Welcome to ShopForge!',
      template: 'welcome',
      data: { name }
    }).catch(err => logger.error('Email send failed:', err));
    
    logger.info(`User registered: ${email} (${role})`);
    
    res.status(201).json({
      success: true,
      message: 'Registration successful',
      data: {
        user,
        accessToken,
      }
    });
  } catch (error) {
    next(error);
  }
};

// ============================================================
// LOGIN
// ============================================================

const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    
    // Find user with password
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        name: true,
        email: true,
        password: true,
        role: true,
        isActive: true,
        avatar: true,
        store: {
          select: { id: true, storeSlug: true, storeName: true }
        },
        subscription: {
          select: { plan: true, status: true, trialEndsAt: true }
        }
      }
    });
    
    if (!user || !await bcrypt.compare(password, user.password)) {
      throw new AppError('Invalid email or password', 401);
    }
    
    if (!user.isActive) {
      throw new AppError('Account has been suspended', 403);
    }
    
    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(user.id);
    
    // Store refresh token
    await prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      }
    });
    
    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() }
    });
    
    setRefreshTokenCookie(res, refreshToken);
    
    // Remove password from response
    const { password: _, ...userWithoutPassword } = user;
    
    logger.info(`User logged in: ${email}`);
    
    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: userWithoutPassword,
        accessToken,
      }
    });
  } catch (error) {
    next(error);
  }
};

// ============================================================
// REFRESH TOKEN
// ============================================================

const refreshToken = async (req, res, next) => {
  try {
    const token = req.cookies.refreshToken;
    
    if (!token) {
      throw new AppError('Refresh token not found', 401);
    }
    
    // Verify token
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
    } catch {
      throw new AppError('Invalid refresh token', 401);
    }
    
    // Check if token exists in DB
    const storedToken = await prisma.refreshToken.findUnique({
      where: { token },
      include: { user: { select: { id: true, isActive: true } } }
    });
    
    if (!storedToken || storedToken.expiresAt < new Date()) {
      throw new AppError('Refresh token expired', 401);
    }
    
    if (!storedToken.user.isActive) {
      throw new AppError('Account suspended', 403);
    }
    
    // Delete old token and issue new ones
    await prisma.refreshToken.delete({ where: { token } });
    
    const tokens = generateTokens(decoded.userId);
    
    await prisma.refreshToken.create({
      data: {
        token: tokens.refreshToken,
        userId: decoded.userId,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      }
    });
    
    setRefreshTokenCookie(res, tokens.refreshToken);
    
    res.json({
      success: true,
      data: { accessToken: tokens.accessToken }
    });
  } catch (error) {
    next(error);
  }
};

// ============================================================
// LOGOUT
// ============================================================

const logout = async (req, res, next) => {
  try {
    const token = req.cookies.refreshToken;
    
    if (token) {
      await prisma.refreshToken.deleteMany({ where: { token } });
      
      // Blacklist access token in Redis
      if (req.user) {
        const accessToken = req.headers.authorization?.split(' ')[1];
        if (accessToken) {
          await redis.setex(`blacklist:${accessToken}`, 900, '1'); // 15min TTL
        }
      }
    }
    
    res.clearCookie('refreshToken');
    
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    next(error);
  }
};

// ============================================================
// GET ME
// ============================================================

const getMe = async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        avatar: true,
        phone: true,
        isEmailVerified: true,
        createdAt: true,
        store: {
          select: {
            id: true,
            storeName: true,
            storeSlug: true,
            logo: true,
            status: true,
          }
        },
        subscription: {
          select: {
            plan: true,
            status: true,
            trialEndsAt: true,
            currentPeriodEnd: true,
          }
        }
      }
    });
    
    if (!user) throw new AppError('User not found', 404);
    
    res.json({ success: true, data: { user } });
  } catch (error) {
    next(error);
  }
};

// ============================================================
// UPDATE PROFILE
// ============================================================

const updateProfile = async (req, res, next) => {
  try {
    const { name, phone, avatar } = req.body;
    
    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: { name, phone, avatar },
      select: {
        id: true, name: true, email: true, role: true, avatar: true, phone: true
      }
    });
    
    res.json({ success: true, data: { user } });
  } catch (error) {
    next(error);
  }
};

// ============================================================
// CHANGE PASSWORD
// ============================================================

const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { password: true }
    });
    
    if (!await bcrypt.compare(currentPassword, user.password)) {
      throw new AppError('Current password is incorrect', 400);
    }
    
    const hashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);
    
    await prisma.user.update({
      where: { id: req.user.id },
      data: { password: hashedPassword }
    });
    
    // Invalidate all refresh tokens
    await prisma.refreshToken.deleteMany({ where: { userId: req.user.id } });
    res.clearCookie('refreshToken');
    
    res.json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    next(error);
  }
};

module.exports = { register, login, refreshToken, logout, getMe, updateProfile, changePassword };
