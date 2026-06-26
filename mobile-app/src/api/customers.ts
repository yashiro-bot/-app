// Customers API. Real implementation lands in T16.
//
// Endpoints (backend reference: backend/src/routes/customers.ts):
//   GET    /customers         — paginated list (MANAGER: assigned only, ADMIN: all)
//   GET    /customers/:id     — single customer
//   POST   /customers         — create (ADMIN)
//   PATCH  /customers/:id     — partial update (ADMIN)
//   DELETE /customers/:id     — soft delete (ADMIN)

import { http } from '../utils/request';

export type CustomerStatus = 'ACTIVE' | 'DISABLED';

export interface Customer {
  id: number;
  code: string;
  name: string;
  address?: string | null;
  contact?: string | null;
  phone?: string | null;
  lat?: number | null;
  lng?: number | null;
  status: CustomerStatus;
}

export interface CustomerListQuery {
  page?: number;
  pageSize?: number;
  status?: CustomerStatus;
  search?: string;
}

export interface CustomerListResponse {
  total: number;
  page: number;
  pageSize: number;
  items: Customer[];
}

export function listCustomers(q: CustomerListQuery = {}): Promise<CustomerListResponse> {
  // TODO(T16): real call → http.get<CustomerListResponse>('/customers', { params: q })
  throw new Error('listCustomers() not implemented (T16)');
}

export function getCustomer(id: number): Promise<Customer> {
  // TODO(T16): real call → http.get<Customer>(`/customers/${id}`)
  throw new Error('getCustomer() not implemented (T16)');
}
