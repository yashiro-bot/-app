<script setup lang="ts">
import { Refresh, Search } from '@element-plus/icons-vue';

interface ManagerOption {
  id: number;
  username: string;
  name: string;
}

type VerifiedFilter = '' | 'true' | 'false';

interface FilterState {
  managerId: number | null;
  dateRange: [string, string] | null;
  isVerified: VerifiedFilter;
}

defineProps<{
  filter: FilterState;
  managers: ManagerOption[];
  loading: boolean;
}>();

const emit = defineEmits<{
  (e: 'query'): void;
  (e: 'reset'): void;
}>();

function onQuery(): void {
  emit('query');
}

function onReset(): void {
  emit('reset');
}
</script>

<template>
  <el-card shadow="never" class="filter-card">
    <el-form :inline="true" class="filter-form" @submit.prevent>
      <el-form-item label="客户经理">
        <el-select
          v-model="filter.managerId"
          placeholder="全部"
          clearable
          filterable
          style="width: 200px"
        >
          <el-option
            v-for="m in managers"
            :key="m.id"
            :label="`${m.name}（${m.username}）`"
            :value="m.id"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="日期范围">
        <el-date-picker
          v-model="filter.dateRange"
          type="daterange"
          value-format="YYYY-MM-DD"
          range-separator="至"
          start-placeholder="开始日期"
          end-placeholder="结束日期"
          unlink-panels
          style="width: 280px"
        />
      </el-form-item>
      <el-form-item label="核实状态">
        <el-select
          v-model="filter.isVerified"
          placeholder="全部"
          clearable
          style="width: 140px"
        >
          <el-option label="已核实" value="true" />
          <el-option label="未核实" value="false" />
        </el-select>
      </el-form-item>
      <el-form-item>
        <el-button type="primary" :loading="loading" @click="onQuery">
          <el-icon><Search /></el-icon>
          查询
        </el-button>
        <el-button @click="onReset">
          <el-icon><Refresh /></el-icon>
          重置
        </el-button>
      </el-form-item>
    </el-form>
  </el-card>
</template>

<style scoped>
.filter-card {
  border-radius: 4px;
}
.filter-form {
  display: flex;
  flex-wrap: wrap;
}
.filter-form :deep(.el-form-item) {
  margin-right: 16px;
  margin-bottom: 0;
}
</style>