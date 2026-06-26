import { defineStore } from 'pinia';
import { ref } from 'vue';
import { http } from '../utils/request';

interface User {
  id: number;
  username: string;
  name: string;
  role: 'ADMIN' | 'MANAGER';
}

interface LoginResponse {
  token: string;
  user: User;
}

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(localStorage.getItem('token'));
  const user = ref<User | null>(JSON.parse(localStorage.getItem('user') || 'null'));

  async function login(username: string, password: string): Promise<void> {
    const res = await http.post<LoginResponse>('/auth/login', { username, password });
    token.value = res.data.token;
    user.value = res.data.user;
    localStorage.setItem('token', res.data.token);
    localStorage.setItem('user', JSON.stringify(res.data.user));
  }

  function logout(): void {
    token.value = null;
    user.value = null;
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  }

  return { token, user, login, logout };
});