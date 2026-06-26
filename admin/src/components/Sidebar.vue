<script setup lang="ts">
import {
  House,
  User,
  Document,
  Tickets,
  Share,
  MapLocation,
  DataAnalysis,
} from '@element-plus/icons-vue';

interface MenuItem {
  index: string;
  title: string;
  icon: typeof House;
}

const items: MenuItem[] = [
  { index: '/dashboard', title: '仪表盘', icon: House },
  { index: '/customers', title: '客户', icon: User },
  { index: '/cigar-specs', title: '烟标规格', icon: Document },
  { index: '/users', title: '用户', icon: Tickets },
  { index: '/assignments', title: '分配', icon: Share },
  { index: '/collections', title: '采集数据', icon: DataAnalysis },
  { index: '/map', title: '地图', icon: MapLocation },
];
</script>

<template>
  <aside class="sidebar">
    <div class="sidebar-brand">cigar-collection</div>
    <el-menu
      class="sidebar-menu"
      router
      background-color="#001529"
      text-color="#cfd8dc"
      active-text-color="#ffffff"
      :default-active="$route.path"
    >
      <el-menu-item v-for="item in items" :key="item.index" :index="item.index">
        <el-icon><component :is="item.icon" /></el-icon>
        <span>{{ item.title }}</span>
      </el-menu-item>
    </el-menu>
  </aside>
</template>

<style scoped>
.sidebar {
  width: 220px;
  background: #001529;
  color: #fff;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}
.sidebar-brand {
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  font-weight: 600;
  color: #fff;
  border-bottom: 1px solid #002140;
}
.sidebar-menu {
  border-right: none;
  flex: 1;
}
</style>