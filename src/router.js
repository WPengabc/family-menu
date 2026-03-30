import { createRouter, createWebHistory } from 'vue-router'

import DishFormPage from './pages/DishFormPage.vue'
import OrderPage from './pages/OrderPage.vue'
import OrdersPage from './pages/OrdersPage.vue'
import MePage from './pages/MePage.vue'
import HistoryPage from './pages/HistoryPage.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/order' },
    { path: '/dish/new', name: 'dishNew', component: DishFormPage },
    { path: '/dish/:id', name: 'dishEdit', component: DishFormPage, props: true },
    { path: '/order', name: 'order', component: OrderPage },
    { path: '/orders', name: 'orders', component: OrdersPage },
    { path: '/me', name: 'me', component: MePage },
    { path: '/me/history', name: 'history', component: HistoryPage },
  ],
})

