// Auth Pinia store. Real wiring (login flow, persistence, route guard) lands in T15.
//
// The store depends on utils/storage.ts (sync uni storage) and api/auth.ts
// (typed function stubs that throw until T15 implements them).

import { defineStore } from 'pinia';
import { storage } from '../utils/storage';
import { login as apiLogin, me as apiMe, type User } from '../api/auth';

interface AuthState {
  token: string | null;
  user: User | null;
}

export const useAuthStore = defineStore('auth', {
  state: (): AuthState => ({
    token: storage.get<string>('token'),
    user: storage.get<User>('user'),
  }),
  getters: {
    isLoggedIn: (state) => state.token !== null,
    isAdmin: (state) => state.user?.role === 'ADMIN',
  },
  actions: {
    async login(username: string, password: string): Promise<void> {
      // TODO(T15): replace stub with real flow + state mutation
      const res = await apiLogin(username, password);
      this.token = res.token;
      this.user = res.user;
      storage.set('token', res.token);
      storage.set('user', res.user);
    },
    async refreshMe(): Promise<void> {
      // TODO(T15): replace stub with real call
      const fresh = await apiMe();
      this.user = fresh;
      storage.set('user', fresh);
    },
    logout(): void {
      this.token = null;
      this.user = null;
      storage.remove('token');
      storage.remove('user');
    },
  },
});
