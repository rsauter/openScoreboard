import { createRouter, createWebHistory } from 'vue-router';
import { getToken } from '../shared';

const routes = [
  { path: '/login',    name: 'Login',     component: () => import('../pages/Login.vue'),    meta: { public: true } },
  { path: '/',         name: 'GameStart', component: () => import('../pages/GameStart.vue') },
  { path: '/operator', name: 'Operator',  component: () => import('../pages/Operator.vue') },
  { path: '/settings', name: 'Settings',  component: () => import('../pages/Settings.vue') },
  { path: '/help',     name: 'Help',      component: () => import('../pages/Help.vue') },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach((to) => {
  if (to.meta.public) return true;
  if (!getToken()) return { name: 'Login', query: { redirect: to.fullPath } };
  return true;
});

export default router;