import type { Router } from 'vue-router';

export function setupGuard(router: Router): void {
  router.beforeEach((to, _from, next) => {
    const token = localStorage.getItem('token');
    if (to.meta.requiresAuth === false) {
      next();
    } else if (!token) {
      next('/login');
    } else {
      next();
    }
  });
}