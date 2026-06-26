import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { http } from '../utils/request';
import { storage } from '../utils/storage';

export interface User {
  id: number;
  username: string;
  name: string;
  role: 'ADMIN' | 'MANAGER';
}

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(storage.get<string>('token'));
  const user = ref<User | null>(storage.get<User>('user'));

  const isLoggedIn = computed(() => !!token.value);

  async function login(username: string, password: string): Promise<void> {
    const res = await http.post('/auth/login', { username, password });
    const { token: newToken, user: newUser } = res.data as { token: string; user: User };
    token.value = newToken;
    user.value = newUser;
    storage.set('token', newToken);
    storage.set('user', newUser);
  }

  function logout(): void {
    token.value = null;
    user.value = null;
    storage.remove('token');
    storage.remove('user');
    uni.reLaunch({ url: '/pages/login/index' });
  }

  return { token, user, isLoggedIn, login, logout };
});