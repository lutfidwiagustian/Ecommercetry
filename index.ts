// ============================================================
// AUTH STORE - Zustand
// ============================================================

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { authAPI } from '@/lib/api';

interface User {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'SELLER' | 'CUSTOMER';
  avatar?: string;
  store?: { id: string; storeName: string; storeSlug: string; logo?: string };
  subscription?: { plan: string; status: string; trialEndsAt?: string };
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  
  login: (email: string, password: string) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => Promise<void>;
  fetchMe: () => Promise<void>;
  updateUser: (data: Partial<User>) => void;
  setAccessToken: (token: string) => void;
}

interface RegisterData {
  name: string;
  email: string;
  password: string;
  role?: string;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      isLoading: false,
      isAuthenticated: false,
      
      login: async (email, password) => {
        set({ isLoading: true });
        try {
          const { data } = await authAPI.login({ email, password });
          const { user, accessToken } = data.data;
          localStorage.setItem('accessToken', accessToken);
          set({ user, accessToken, isAuthenticated: true });
        } finally {
          set({ isLoading: false });
        }
      },
      
      register: async (registerData) => {
        set({ isLoading: true });
        try {
          const { data } = await authAPI.register(registerData);
          const { user, accessToken } = data.data;
          localStorage.setItem('accessToken', accessToken);
          set({ user, accessToken, isAuthenticated: true });
        } finally {
          set({ isLoading: false });
        }
      },
      
      logout: async () => {
        try {
          await authAPI.logout();
        } catch {}
        localStorage.removeItem('accessToken');
        set({ user: null, accessToken: null, isAuthenticated: false });
      },
      
      fetchMe: async () => {
        try {
          const { data } = await authAPI.getMe();
          set({ user: data.data.user, isAuthenticated: true });
        } catch {
          set({ user: null, isAuthenticated: false });
        }
      },
      
      updateUser: (userData) => {
        set(state => ({ user: state.user ? { ...state.user, ...userData } : null }));
      },
      
      setAccessToken: (token) => {
        localStorage.setItem('accessToken', token);
        set({ accessToken: token });
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({ user: state.user, accessToken: state.accessToken, isAuthenticated: state.isAuthenticated }),
    }
  )
);

// ============================================================
// CART STORE
// ============================================================

interface CartItem {
  id: string;
  productId: string;
  variantId?: string;
  quantity: number;
  product: {
    name: string;
    price: number;
    images: Array<{ url: string }>;
    store: { storeName: string; storeSlug: string };
  };
}

interface CartState {
  items: CartItem[];
  isOpen: boolean;
  itemCount: number;
  total: number;
  
  setItems: (items: CartItem[]) => void;
  addItem: (item: CartItem) => void;
  removeItem: (id: string) => void;
  updateQuantity: (id: string, qty: number) => void;
  clearCart: () => void;
  toggleCart: () => void;
  openCart: () => void;
  closeCart: () => void;
}

export const useCartStore = create<CartState>((set, get) => ({
  items: [],
  isOpen: false,
  itemCount: 0,
  total: 0,
  
  setItems: (items) => {
    const itemCount = items.reduce((acc, i) => acc + i.quantity, 0);
    const total = items.reduce((acc, i) => acc + i.quantity * Number(i.product?.price || 0), 0);
    set({ items, itemCount, total });
  },
  
  addItem: (item) => {
    const { items } = get();
    const existing = items.find(i => i.productId === item.productId && i.variantId === item.variantId);
    const newItems = existing
      ? items.map(i => i.id === existing.id ? { ...i, quantity: i.quantity + item.quantity } : i)
      : [...items, item];
    
    const itemCount = newItems.reduce((acc, i) => acc + i.quantity, 0);
    const total = newItems.reduce((acc, i) => acc + i.quantity * Number(i.product?.price || 0), 0);
    set({ items: newItems, itemCount, total });
  },
  
  removeItem: (id) => {
    const newItems = get().items.filter(i => i.id !== id);
    const itemCount = newItems.reduce((acc, i) => acc + i.quantity, 0);
    const total = newItems.reduce((acc, i) => acc + i.quantity * Number(i.product?.price || 0), 0);
    set({ items: newItems, itemCount, total });
  },
  
  updateQuantity: (id, qty) => {
    const newItems = qty < 1
      ? get().items.filter(i => i.id !== id)
      : get().items.map(i => i.id === id ? { ...i, quantity: qty } : i);
    const itemCount = newItems.reduce((acc, i) => acc + i.quantity, 0);
    const total = newItems.reduce((acc, i) => acc + i.quantity * Number(i.product?.price || 0), 0);
    set({ items: newItems, itemCount, total });
  },
  
  clearCart: () => set({ items: [], itemCount: 0, total: 0 }),
  toggleCart: () => set(s => ({ isOpen: !s.isOpen })),
  openCart: () => set({ isOpen: true }),
  closeCart: () => set({ isOpen: false }),
}));
