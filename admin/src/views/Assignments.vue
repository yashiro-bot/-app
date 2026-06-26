<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { http } from '../utils/request';

interface Manager {
  id: number;
  username: string;
  name: string;
}

interface Customer {
  id: number;
  code: string;
  name: string;
  address: string | null;
}

interface Assignment {
  id: number;
  customerId: number;
  customer: Customer;
}

interface TransferItem {
  key: number;
  label: string;
}

const managers = ref<Manager[]>([]);
const allCustomers = ref<Customer[]>([]);
const assignments = ref<Assignment[]>([]);
const selectedManagerId = ref<number | null>(null);
const rightKeys = ref<number[]>([]);
const loading = ref<boolean>(false);
const saving = ref<boolean>(false);

const transferData = computed<TransferItem[]>(() =>
  allCustomers.value.map((c) => ({
    key: c.id,
    label: `${c.code} ${c.name}`,
  })),
);

const assignedCount = computed<number>(() => rightKeys.value.length);

async function fetchManagers(): Promise<void> {
  try {
    const res = await http.get<{ data: Manager[] }>('/users', {
      params: { role: 'MANAGER', pageSize: 1000 },
    });
    managers.value = res.data.data;
    if (!selectedManagerId.value && managers.value.length > 0) {
      const first = managers.value[0];
      if (first) selectedManagerId.value = first.id;
    }
  } catch {
    ElMessage.error('经理列表加载失败');
  }
}

async function fetchAllCustomers(): Promise<void> {
  try {
    const res = await http.get<{ data: Customer[] }>('/customers', {
      params: { pageSize: 1000 },
    });
    allCustomers.value = res.data.data;
  } catch {
    ElMessage.error('客户列表加载失败');
  }
}

async function fetchAssignments(): Promise<void> {
  if (selectedManagerId.value === null) {
    assignments.value = [];
    rightKeys.value = [];
    return;
  }
  loading.value = true;
  try {
    const res = await http.get<Assignment[]>('/assignments', {
      params: { manager_id: selectedManagerId.value },
    });
    assignments.value = res.data;
    rightKeys.value = res.data.map((a) => a.customerId);
  } catch {
    ElMessage.error('分配列表加载失败');
    assignments.value = [];
    rightKeys.value = [];
  } finally {
    loading.value = false;
  }
}

async function saveAssignments(): Promise<void> {
  if (selectedManagerId.value === null) {
    ElMessage.warning('请先选择客户经理');
    return;
  }
  saving.value = true;
  try {
    await http.post('/assignments', {
      manager_id: selectedManagerId.value,
      customer_ids: rightKeys.value,
    });
    ElMessage.success('分配已保存');
    await fetchAssignments();
  } catch {
    ElMessage.error('保存失败');
  } finally {
    saving.value = false;
  }
}

watch(selectedManagerId, () => {
  void fetchAssignments();
});

onMounted(async () => {
  await Promise.all([fetchManagers(), fetchAllCustomers()]);
  await fetchAssignments();
});
</script>

<template>
  <div class="assignments-page">
    <header class="page-header">
      <h2>客户经理分配</h2>
      <div class="header-actions">
        <span class="label">选择客户经理：</span>
        <el-select
          v-model="selectedManagerId"
          placeholder="请选择经理"
          filterable
          style="width: 220px"
        >
          <el-option
            v-for="m in managers"
            :key="m.id"
            :label="`${m.name}（${m.username}）`"
            :value="m.id"
          />
        </el-select>
        <el-button
          type="primary"
          :loading="saving"
          :disabled="selectedManagerId === null"
          @click="saveAssignments"
        >
          保存分配（{{ assignedCount }}）
        </el-button>
      </div>
    </header>

    <el-card v-loading="loading" shadow="never" class="transfer-card">
      <el-transfer
        v-model="rightKeys"
        :data="transferData"
        :titles="['未分配', '已分配']"
        filterable
        :filter-placeholder="'搜索编码或名称'"
        :button-texts="['取消分配', '分配']"
        target-order="push"
      />
    </el-card>
  </div>
</template>

<style scoped>
.assignments-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}
.page-header h2 {
  margin: 0;
  font-size: 20px;
}
.header-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}
.header-actions .label {
  color: #606266;
  font-size: 14px;
}
.transfer-card {
  min-height: 480px;
}
.transfer-card :deep(.el-transfer) {
  display: flex;
  justify-content: space-between;
}
.transfer-card :deep(.el-transfer-panel) {
  width: 380px;
}
</style>
