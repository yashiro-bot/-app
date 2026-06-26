import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    redirect: '/dashboard',
  },
  {
    path: '/login',
    name: 'login',
    component: () => import('../views/Login.vue'),
    meta: { requiresAuth: false },
  },
  {
    path: '/dashboard',
    name: 'dashboard',
    component: () => import('../views/Dashboard.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/customers',
    name: 'customers',
    component: () => import('../views/Customers.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/customers/import',
    name: 'customers-import',
    component: () => import('../views/CustomersImport.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/cigar-specs',
    name: 'cigar-specs',
    component: () => import('../views/CigarSpecs.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/users',
    name: 'users',
    component: () => import('../views/Users.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/assignments',
    name: 'assignments',
    component: () => import('../views/Assignments.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/collections',
    name: 'collections',
    component: () => import('../views/Collections.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/map',
    name: 'map',
    component: () => import('../views/Map.vue'),
    meta: { requiresAuth: true },
  },
];

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
});