import axios from 'axios';
import { storage } from './storage';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3000';

export const http = axios.create({
  baseURL: API_BASE,
  timeout: 15000,
});

http.interceptors.request.use((config) => {
  const token = storage.get<string>('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

http.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      storage.remove('token');
      storage.remove('user');
      uni.reLaunch({ url: '/pages/login/index' });
    }
    return Promise.reject(err);
  },
);
