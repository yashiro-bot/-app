import axios from 'axios';
import { ElMessage } from 'element-plus';

export const http = axios.create({ baseURL: '/api' });

http.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

http.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      ElMessage.error('登录已过期，请重新登录');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);