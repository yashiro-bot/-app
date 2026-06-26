import { http } from '../utils/request';
import type { User } from '../stores/auth';

export async function login(username: string, password: string): Promise<{token: string; user: User}> {
  const res = await http.post('/auth/login', { username, password });
  return res.data;
}