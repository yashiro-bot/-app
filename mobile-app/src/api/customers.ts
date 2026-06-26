// Customers API.
//
// Endpoints (backend reference: backend/src/routes/customers.ts):
//   GET  /customers         — paginated list (MANAGER: assigned only, ADMIN: all)
//   GET  /customers/:id     — single customer + assignments
//
// Admin/manager scoping is enforced server-side; we just pass the token.

import { http } from '../utils/request';

export interface Customer {
  id: number;
  code: string;
  name: string;
  address: string | null;
  contact: string | null;
  phone: string | null;
  lat: number | null;
  lng: number | null;
  status: 'ACTIVE' | 'DISABLED';
}

export interface PaginatedCustomers {
  data: Customer[];
  total: number;
  page: number;
  pageSize: number;
}

export async function listCustomers(params?: {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
}): Promise<PaginatedCustomers> {
  const res = await http.get('/customers', { params });
  return res.data;
}

export async function getCustomer(id: number): Promise<Customer & { assignments: any[] }> {
  const res = await http.get(`/customers/${id}`);
  return res.data;
}
