import { createRouter, createWebHistory } from 'vue-router';
import { getToken } from '../shared';

// GameStart.vue is no longer its own route — it's embedded inside Operator.vue
// and shown automatically whenever no game is currently running (phase === 'pregame').
// "/" exists only as a stable bookmark/redirect target.
const routes = [
  { path: '/login',    name: 'Login',     component: () => import('../pages/Login.vue'),    meta: { public: true } },
  { path: '/',         name: 'Home',      redirect: { name: 'Operator' } },
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