// ============================================================
// API CLIENT - Axios with interceptors
// ============================================================

import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api/v1';

export const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

// Request interceptor - attach token
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('accessToken');
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor - refresh token on 401
let isRefreshing = false;
let refreshSubscribers: Array<(token: string) => void> = [];

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    
    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve) => {
          refreshSubscribers.push((token: string) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            resolve(api(originalRequest));
          });
        });
      }
      
      originalRequest._retry = true;
      isRefreshing = true;
      
      try {
        const { data } = await api.post('/auth/refresh');
        const newToken = data.data.accessToken;
        localStorage.setItem('accessToken', newToken);
        
        refreshSubscribers.forEach((cb) => cb(newToken));
        refreshSubscribers = [];
        
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return api(originalRequest);
      } catch {
        localStorage.removeItem('accessToken');
        if (typeof window !== 'undefined') window.location.href = '/login';
        return Promise.reject(error);
      } finally {
        isRefreshing = false;
      }
    }
    
    return Promise.reject(error);
  }
);

// ============================================================
// API METHODS
// ============================================================

export const authAPI = {
  register: (data: any) => api.post('/auth/register', data),
  login: (data: any) => api.post('/auth/login', data),
  logout: () => api.post('/auth/logout'),
  getMe: () => api.get('/auth/me'),
  updateProfile: (data: any) => api.put('/auth/me', data),
  changePassword: (data: any) => api.post('/auth/change-password', data),
};

export const storeAPI = {
  create: (data: any) => api.post('/stores', data),
  getBySlug: (slug: string) => api.get(`/stores/${slug}`),
  getMyStore: () => api.get('/stores/my/store'),
  update: (data: any) => api.put('/stores/my/store', data),
  getDashboard: () => api.get('/stores/my/dashboard'),
  getAllStores: (params: any) => api.get('/stores', { params }),
};

export const productAPI = {
  create: (data: any) => api.post('/products', data),
  getByStore: (slug: string, params?: any) => api.get(`/products/store/${slug}`, { params }),
  getBySlug: (storeSlug: string, productSlug: string) => api.get(`/products/store/${storeSlug}/${productSlug}`),
  update: (id: string, data: any) => api.put(`/products/${id}`, data),
  delete: (id: string) => api.delete(`/products/${id}`),
  getSellerProducts: (params?: any) => api.get('/products/seller/mine', { params }),
};

export const cartAPI = {
  get: () => api.get('/cart'),
  addItem: (data: any) => api.post('/cart/items', data),
  updateItem: (itemId: string, quantity: number) => api.put(`/cart/items/${itemId}`, { quantity }),
  removeItem: (itemId: string) => api.delete(`/cart/items/${itemId}`),
  clear: () => api.delete('/cart'),
};

export const orderAPI = {
  create: (data: any) => api.post('/orders', data),
  getMyOrders: (params?: any) => api.get('/orders/my', { params }),
  getById: (id: string) => api.get(`/orders/${id}`),
  getStoreOrders: (params?: any) => api.get('/orders/store/all', { params }),
  updateStatus: (id: string, data: any) => api.patch(`/orders/${id}/status`, data),
};

export const reviewAPI = {
  create: (data: any) => api.post('/reviews', data),
  getByProduct: (productId: string) => api.get(`/reviews/product/${productId}`),
};

export const categoryAPI = {
  getByStore: (storeSlug: string) => api.get(`/categories/store/${storeSlug}`),
  create: (data: any) => api.post('/categories', data),
};

export const subscriptionAPI = {
  getPlans: () => api.get('/subscriptions/plans'),
  getMy: () => api.get('/subscriptions/my'),
  upgrade: (data: any) => api.post('/subscriptions/upgrade', data),
};

export const uploadAPI = {
  uploadImage: (file: File) => {
    const formData = new FormData();
    formData.append('image', file);
    return api.post('/upload/image', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  },
  uploadImages: (files: File[]) => {
    const formData = new FormData();
    files.forEach(f => formData.append('images', f));
    return api.post('/upload/images', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  },
};

export const wishlistAPI = {
  get: () => api.get('/wishlist'),
  toggle: (productId: string) => api.post(`/wishlist/${productId}`),
};

export const couponAPI = {
  validate: (data: any) => api.post('/coupons/validate', data),
  create: (data: any) => api.post('/coupons', data),
  getStore: () => api.get('/coupons/store'),
};

export default api;
