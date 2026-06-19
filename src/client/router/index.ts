import { createRouter, createWebHistory } from 'vue-router';

const routes = [
  { path: '/',         name: 'GameStart', component: () => import('../pages/GameStart.vue') },
  { path: '/operator', name: 'Operator',  component: () => import('../pages/Operator.vue') },
  { path: '/settings', name: 'Settings',  component: () => import('../pages/Settings.vue') },
  { path: '/help',     name: 'Help',      component: () => import('../pages/Help.vue') },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

export default router;