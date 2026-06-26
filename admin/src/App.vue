<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import Sidebar from './components/Sidebar.vue';
import Navbar from './components/Navbar.vue';

const route = useRoute();
const isLogin = computed<boolean>(() => route.path === '/login');
</script>

<template>
  <el-config-provider>
    <template v-if="isLogin">
      <router-view />
    </template>
    <template v-else>
      <div class="app-shell">
        <Sidebar />
        <div class="app-main">
          <Navbar />
          <main class="app-content">
            <router-view />
          </main>
        </div>
      </div>
    </template>
  </el-config-provider>
</template>

<style scoped>
.app-shell {
  display: flex;
  min-height: 100vh;
}
.app-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.app-content {
  flex: 1;
  padding: 24px;
  background: #f5f7fa;
  overflow: auto;
}
</style>