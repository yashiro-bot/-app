<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { Download, Refresh, Search } from '@element-plus/icons-vue';
import { http } from '../utils/request';

// ─── Types ────────────────────────────────────────────────────────────────

interface ManagerOption {
  id: number;
  username: string;
  name: string;
}

interface CustomerOption {
  id: number;
  code: string;
  name: string;
}

interface CollectionListItem {
  id: number;
  customerId: number;
  gpsLat: number;
  gpsLng: number;
  distanceToCustomerM: number | null;
  isVerified: boolean;
  collectedAt: string;
  photoUrls: string[];
  customer: {
    id: number;
    code: string;
    name: string;
    address: string | null;
  };
  manager: { id: number; name: string };
  detailsCount: number;
}

interface CollectionDetail extends Omit<CollectionListItem, 'manager'> {
  manager: { id: number; username: string; name: string };
  details: Array<{
    id: number;
    cigarSpecId: number;
    salesQty: number;
    actualStockLoose: number;
    countedStockLoose: number;
    actualStockBoxed: number;
    countedStockBoxed: number;
    cigarSpec: {
      id: number;
      code: string;
      name: string;
      category: string;
    };
  }>;
}

interface ListResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

type VerifiedFilter = '' | 'true' | 'false';

interface FilterState {
  managerId: number | null;
  customerId: number | null;
  dateRange: [string, string] | null;
  isVerified: VerifiedFilter;
}

const EMPTY_FILTER: FilterState = {
  managerId: null,
  customerId: null,
  dateRange: null,
  isVerified: '',
};

// ─── State ────────────────────────────────────────────────────────────────

const managers = ref<ManagerOption[]>([]);
const customers = ref<CustomerOption[]>([]);

const filter = reactive<FilterState>({
  managerId: null,
  customerId: null,
  dateRange: null,
  isVerified: '',
});

const list = ref<CollectionListItem[]>([]);
const total = ref<number>(0);
const loading = ref<boolean>(false);
const page = ref<number>(1);
const pageSize = ref<number>(20);
const exporting = ref<boolean>(false);

const detailVisible = ref<boolean>(false);
const detailLoading = ref<boolean>(false);
const detail = ref<CollectionDetail | null>(null);

// ─── API helpers ──────────────────────────────────────────────────────────

async function fetchManagers(): Promise<void> {
  try {
    const res = await http.get<ListResponse<ManagerOption>>('/users', {
      params: { role: 'MANAGER', pageSize: 1000 },
    });
    managers.value = res.data.data;
  } catch {
    ElMessage.error('经理列表加载失败');
  }
}

async function fetchCustomers(): Promise<void> {
  try {
    const res = await http.get<ListResponse<CustomerOption>>('/customers', {
      params: { pageSize: 1000 },
    });
    customers.value = res.data.data;
  } catch {
    ElMessage.error('客户列表加载失败');
  }
}

async function fetchList(): Promise<void> {
  loading.value = true;
  try {
    const params: Record<string, string | number | boolean> = {
      page: page.value,
      pageSize: pageSize.value,
    };
    if (filter.managerId !== null) params.managerId = filter.managerId;
    if (filter.customerId !== null) params.customerId = filter.customerId;
    if (filter.dateRange !== null) {
      params.fromDate = filter.dateRange[0];
      params.toDate = filter.dateRange[1];
    }
    if (filter.isVerified !== '') {
      params.isVerified = filter.isVerified === 'true';
    }
    const res = await http.get<ListResponse<CollectionListItem>>(
      '/collections',
      { params },
    );
    list.value = res.data.data;
    total.value = res.data.total;
  } catch {
    ElMessage.error('采集记录加载失败');
  } finally {
    loading.value = false;
  }
}

async function openDetail(item: CollectionListItem): Promise<void> {
  detailVisible.value = true;
  detailLoading.value = true;
  detail.value = null;
  try {
    const res = await http.get<CollectionDetail>(`/collections/${item.id}`);
    detail.value = res.data;
  } catch {
    ElMessage.error('采集详情加载失败');
  } finally {
    detailLoading.value = false;
  }
}

function closeDetail(): void {
  detailVisible.value = false;
  detail.value = null;
}

function todayIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

async function exportExcel(): Promise<void> {
  if (exporting.value) return;
  exporting.value = true;
  try {
    const params: Record<string, string | number> = {};
    if (filter.dateRange !== null) {
      params.from = filter.dateRange[0];
      params.to = filter.dateRange[1];
    } else {
      params.from = '1970-01-01';
      params.to = todayIso();
    }
    if (filter.managerId !== null) params.managerId = filter.managerId;
    if (filter.customerId !== null) params.customerId = filter.customerId;

    const res = await http.get<Blob>('/exports/collections', {
      params,
      responseType: 'blob',
    });
    const blob = res.data;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `collections-${todayIso()}.xlsx`;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    ElMessage.success('导出已开始');
  } catch {
    ElMessage.error('导出失败');
  } finally {
    exporting.value = false;
  }
}

// ─── Formatters ───────────────────────────────────────────────────────────

function formatDateTime(iso: string): string {
  if (iso === '') return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number): string => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

function formatDistance(m: number | null): string {
  if (m === null) return '-';
  return `${m.toFixed(0)} m`;
}

function formatCoord(lat: number, lng: number): string {
  return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
}

function verifiedType(v: boolean): 'success' | 'danger' {
  return v ? 'success' : 'danger';
}

function verifiedLabel(v: boolean): string {
  return v ? '已核实' : '未核实';
}

// ─── Filter handlers ──────────────────────────────────────────────────────

function onQuery(): void {
  page.value = 1;
  void fetchList();
}

function onReset(): void {
  filter.managerId = EMPTY_FILTER.managerId;
  filter.customerId = EMPTY_FILTER.customerId;
  filter.dateRange = EMPTY_FILTER.dateRange;
  filter.isVerified = EMPTY_FILTER.isVerified;
  page.value = 1;
  void fetchList();
}

function onSizeChange(): void {
  page.value = 1;
  void fetchList();
}

function onPageChange(): void {
  void fetchList();
}

onMounted(async () => {
  await Promise.all([fetchManagers(), fetchCustomers()]);
  await fetchList();
});
</script>

<template>
  <div class="collections-page">
    <header class="page-header">
      <h2>采集记录</h2>
      <div class="header-actions">
        <el-button type="success" :loading="exporting" @click="exportExcel">
          <el-icon><Download /></el-icon>
          导出 Excel
        </el-button>
      </div>
    </header>

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
        <el-form-item label="客户">
          <el-select
            v-model="filter.customerId"
            placeholder="全部"
            clearable
            filterable
            style="width: 240px"
          >
            <el-option
              v-for="c in customers"
              :key="c.id"
              :label="`${c.code} ${c.name}`"
              :value="c.id"
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
          <el-button type="primary" @click="onQuery">
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

    <el-table v-loading="loading" :data="list" border stripe>
      <el-table-column prop="customer.code" label="客户编码" width="140" />
      <el-table-column
        prop="customer.name"
        label="客户名称"
        min-width="180"
        show-overflow-tooltip
      />
      <el-table-column prop="manager.name" label="经理" width="120" />
      <el-table-column label="采集时间" width="180">
        <template #default="{ row }: { row: CollectionListItem }">
          {{ formatDateTime(row.collectedAt) }}
        </template>
      </el-table-column>
      <el-table-column label="GPS 距离" width="110" align="right">
        <template #default="{ row }: { row: CollectionListItem }">
          {{ formatDistance(row.distanceToCustomerM) }}
        </template>
      </el-table-column>
      <el-table-column label="核实状态" width="100">
        <template #default="{ row }: { row: CollectionListItem }">
          <el-tag :type="verifiedType(row.isVerified)" disable-transitions>
            {{ verifiedLabel(row.isVerified) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="明细数" width="80" align="right">
        <template #default="{ row }: { row: CollectionListItem }">
          {{ row.detailsCount }}
        </template>
      </el-table-column>
      <el-table-column label="操作" width="120" fixed="right">
        <template #default="{ row }: { row: CollectionListItem }">
          <el-button size="small" link type="primary" @click="openDetail(row)">
            查看详情
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <footer class="page-footer">
      <el-pagination
        v-model:current-page="page"
        v-model:page-size="pageSize"
        :total="total"
        :page-sizes="[10, 20, 50, 100]"
        layout="total, sizes, prev, pager, next, jumper"
        @size-change="onSizeChange"
        @current-change="onPageChange"
      />
    </footer>

    <el-dialog
      v-model="detailVisible"
      title="采集详情"
      width="960px"
      :close-on-click-modal="false"
      @close="closeDetail"
    >
      <div v-loading="detailLoading" class="detail-content">
        <el-descriptions
          v-if="detail"
          :column="3"
          border
          class="detail-meta"
        >
          <el-descriptions-item label="客户编码">
            {{ detail.customer.code }}
          </el-descriptions-item>
          <el-descriptions-item label="客户名称">
            {{ detail.customer.name }}
          </el-descriptions-item>
          <el-descriptions-item label="客户经理">
            {{ detail.manager.name }}
            <span v-if="detail.manager.username" class="meta-sub">
              （{{ detail.manager.username }}）
            </span>
          </el-descriptions-item>
          <el-descriptions-item label="采集时间">
            {{ formatDateTime(detail.collectedAt) }}
          </el-descriptions-item>
          <el-descriptions-item label="GPS 坐标">
            {{ formatCoord(detail.gpsLat, detail.gpsLng) }}
          </el-descriptions-item>
          <el-descriptions-item label="GPS 距离">
            {{ formatDistance(detail.distanceToCustomerM) }}
          </el-descriptions-item>
          <el-descriptions-item label="核实状态">
            <el-tag
              :type="verifiedType(detail.isVerified)"
              disable-transitions
            >
              {{ verifiedLabel(detail.isVerified) }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="采集明细">
            {{ detail.details.length }} 项
          </el-descriptions-item>
          <el-descriptions-item label="照片数">
            {{ detail.photoUrls.length }}
          </el-descriptions-item>
        </el-descriptions>

        <el-table
          v-if="detail"
          :data="detail.details"
          border
          stripe
          size="small"
          class="detail-table"
        >
          <el-table-column
            prop="cigarSpec.code"
            label="规格编码"
            width="140"
          />
          <el-table-column
            prop="cigarSpec.name"
            label="规格名称"
            min-width="200"
            show-overflow-tooltip
          />
          <el-table-column
            prop="cigarSpec.category"
            label="分类"
            width="140"
          />
          <el-table-column
            prop="salesQty"
            label="销售支数"
            width="100"
            align="right"
          />
          <el-table-column
            prop="actualStockLoose"
            label="裸养实际"
            width="110"
            align="right"
          />
          <el-table-column
            prop="countedStockLoose"
            label="裸养盘点"
            width="110"
            align="right"
          />
          <el-table-column
            prop="actualStockBoxed"
            label="盒养实际"
            width="110"
            align="right"
          />
          <el-table-column
            prop="countedStockBoxed"
            label="盒养盘点"
            width="110"
            align="right"
          />
        </el-table>
      </div>
      <template #footer>
        <el-button @click="detailVisible = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.collections-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
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
.page-footer {
  display: flex;
  justify-content: flex-end;
}
.detail-content {
  min-height: 200px;
}
.detail-meta {
  margin-bottom: 16px;
}
.detail-table {
  width: 100%;
}
.meta-sub {
  color: #909399;
  font-size: 12px;
  margin-left: 4px;
}
</style>
