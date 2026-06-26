<script setup lang="ts">
import { Location } from '@element-plus/icons-vue';

interface Summary {
  total: number;
  verified: number;
  unverified: number;
}

defineProps<{ summary: Summary }>();
</script>

<template>
  <el-card shadow="never" class="summary-card">
    <div class="summary-bar">
      <span class="summary-item">
        <el-icon><Location /></el-icon>
        总记录 <strong>{{ summary.total }}</strong> 条
      </span>
      <span class="summary-item verified">
        <span class="dot dot-verified" />
        已核实 <strong>{{ summary.verified }}</strong> 条
      </span>
      <span class="summary-item unverified">
        <span class="dot dot-unverified" />
        未核实 <strong>{{ summary.unverified }}</strong> 条
      </span>
    </div>
  </el-card>
</template>

<style scoped>
.summary-card {
  border-radius: 4px;
}
.summary-bar {
  display: flex;
  gap: 32px;
  align-items: center;
  flex-wrap: wrap;
}
.summary-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  color: #606266;
}
.summary-item strong {
  font-size: 18px;
  color: #303133;
  margin: 0 4px;
}
.summary-item.verified strong {
  color: #67c23a;
}
.summary-item.unverified strong {
  color: #f56c6c;
}
.dot {
  display: inline-block;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 2px solid;
}
.dot-verified {
  background: #67c23a;
  border-color: #67c23a;
}
.dot-unverified {
  background: #f56c6c;
  border-color: #f56c6c;
}
</style>