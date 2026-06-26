<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';

const authStore = useAuthStore();
const router = useRouter();

const username = computed<string>(() => authStore.user?.name ?? authStore.user?.username ?? '未登录');

async function handleLogout(): Promise<void> {
  authStore.logout();
  await router.push('/login');
}
</script>

<template>
  <header class="navbar">
    <div class="navbar-spacer" />
    <div class="navbar-user">
      <span class="navbar-welcome">欢迎，{{ username }}</span>
      <el-button type="danger" size="small" @click="handleLogout">退出登录</el-button>
    </div>
  </header>
</template>

<style scoped>
.navbar {
  height: 60px;
  background: #fff;
  border-bottom: 1px solid #e6e8eb;
  display: flex;
  align-items: center;
  padding: 0 16px;
  flex-shrink: 0;
}
.navbar-spacer {
  flex: 1;
}
.navbar-user {
  display: flex;
  align-items: center;
  gap: 12px;
}
.navbar-welcome {
  color: #303133;
  font-size: 14px;
}
</style>