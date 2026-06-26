<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { use } from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { BarChart, LineChart, PieChart } from 'echarts/charts';
import {
  GridComponent,
  LegendComponent,
  TitleComponent,
  TooltipComponent,
} from 'echarts/components';
import type { EChartsOption } from 'echarts';
import VChart from 'vue-echarts';
import { Calendar, DataAnalysis, Position, UserFilled } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { http } from '../utils/request';

// ─── ECharts registration (tree-shake to keep bundle small) ─────────────────

use([
  CanvasRenderer,
  LineChart,
  BarChart,
  PieChart,
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  GridComponent,
]);

// ─── Types ──────────────────────────────────────────────────────────────────

interface CollectionRow {
  id: number;
  customerId: number;
  managerId: number;
  isVerified: boolean;
  collectedAt: string;
}

interface ManagerOption {
  id: number;
  username: string;
  name: string;
}

interface ListResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

interface KpiState {
  today: number;
  month: number;
  verifiedRate: number;
  verifiedCount: number;
  monthTotal: number;
  pendingSync: number;
}

interface DailyBucket {
  date: string;
  count: number;
}

interface ManagerBucket {
  id: number;
  name: string;
  count: number;
}

// ─── Date helpers ───────────────────────────────────────────────────────────

/** Format Date → 'YYYY-MM-DDTHH:mm:ss.sssZ' (UTC) for API date filtering. */
function toIsoStart(d: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` +
    `T00:00:00.000Z`
  );
}

function toIsoEnd(d: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` +
    `T23:59:59.999Z`
  );
}

function utcDateOnly(d: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function buildWindow(daysBack: number): { from: Date; to: Date } {
  const now = new Date();
  const to = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999),
  );
  const from = new Date(to.getTime());
  from.setUTCDate(from.getUTCDate() - (daysBack - 1));
  from.setUTCHours(0, 0, 0, 0);
  return { from, to };
}

// ─── Reactive state ─────────────────────────────────────────────────────────

const loading = ref<boolean>(false);

const kpi = ref<KpiState>({
  today: 0,
  month: 0,
  verifiedRate: 0,
  verifiedCount: 0,
  monthTotal: 0,
  pendingSync: 0,
});

const trend = ref<DailyBucket[]>([]);
const byManager = ref<ManagerBucket[]>([]);
const coverage = ref<{ collected: number; uncollected: number }>({
  collected: 0,
  uncollected: 0,
});

// ─── API fetchers ───────────────────────────────────────────────────────────

async function fetchTotal(params: {
  fromDate?: string;
  toDate?: string;
  managerId?: number;
  isVerified?: boolean;
}): Promise<number> {
  const res = await http.get<ListResponse<CollectionRow>>('/collections', {
    params: { page: 1, pageSize: 1, ...params },
  });
  return res.data.total;
}

async function fetchRows(params: {
  fromDate?: string;
  toDate?: string;
  pageSize?: number;
}): Promise<CollectionRow[]> {
  const res = await http.get<ListResponse<CollectionRow>>('/collections', {
    params: { page: 1, pageSize: 100, ...params },
  });
  return res.data.data;
}

async function fetchCustomersTotal(): Promise<number> {
  const res = await http.get<ListResponse<unknown>>('/customers', {
    params: { page: 1, pageSize: 1 },
  });
  return res.data.total;
}

async function fetchManagers(): Promise<ManagerOption[]> {
  const res = await http.get<ListResponse<ManagerOption>>('/users', {
    params: { role: 'MANAGER', page: 1, pageSize: 100 },
  });
  return res.data.data;
}

async function loadDashboard(): Promise<void> {
  loading.value = true;
  try {
    const now = new Date();
    const todayStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const monthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
    const { from: trendFrom, to: trendTo } = buildWindow(30);

    // ─── KPI counts (use `total` so we don't depend on pagination) ────────
    const [
      todayCount,
      monthTotal,
      monthVerified,
      customerTotal,
      managers,
    ] = await Promise.all([
      fetchTotal({ fromDate: toIsoStart(todayStart), toDate: toIsoEnd(todayStart) }),
      fetchTotal({ fromDate: toIsoStart(monthStart), toDate: toIsoEnd(todayStart) }),
      fetchTotal({
        fromDate: toIsoStart(monthStart),
        toDate: toIsoEnd(todayStart),
        isVerified: true,
      }),
      fetchCustomersTotal(),
      fetchManagers(),
    ]);

    // ─── 30-day trend (use sample rows; bucket by date) ───────────────────
    const trendRows = await fetchRows({
      fromDate: toIsoStart(trendFrom),
      toDate: toIsoEnd(trendTo),
      pageSize: 100,
    });

    // ─── Per-manager counts (this month) ──────────────────────────────────
    const managerCounts = await Promise.all(
      managers.map(async (m) => {
        const count = await fetchTotal({
          managerId: m.id,
          fromDate: toIsoStart(monthStart),
          toDate: toIsoEnd(todayStart),
        });
        return { id: m.id, name: m.name, count };
      }),
    );

    // ─── Customer coverage (已采集 = unique customerIds in fetched rows) ──
    const uniqueCustomerIds = new Set<number>();
    for (const row of trendRows) uniqueCustomerIds.add(row.customerId);

    kpi.value = {
      today: todayCount,
      month: monthTotal,
      verifiedRate:
        monthTotal > 0 ? Math.round((monthVerified / monthTotal) * 100) : 0,
      verifiedCount: monthVerified,
      monthTotal,
      pendingSync: 0,
    };

    // Build dense daily buckets so the line chart has no gaps on empty days.
    const dailyMap = new Map<string, number>();
    for (const row of trendRows) {
      const key = utcDateOnly(new Date(row.collectedAt));
      dailyMap.set(key, (dailyMap.get(key) ?? 0) + 1);
    }
    const dense: DailyBucket[] = [];
    for (let i = 29; i >= 0; i -= 1) {
      const d = new Date(trendFrom);
      d.setUTCDate(d.getUTCDate() + i);
      const key = utcDateOnly(d);
      dense.push({ date: key.slice(5), count: dailyMap.get(key) ?? 0 });
    }
    trend.value = dense;

    byManager.value = managerCounts
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    coverage.value = {
      collected: Math.min(uniqueCustomerIds.size, customerTotal),
      uncollected: Math.max(customerTotal - uniqueCustomerIds.size, 0),
    };
  } catch {
    ElMessage.error('仪表盘数据加载失败');
  } finally {
    loading.value = false;
  }
}

// ─── Chart options ──────────────────────────────────────────────────────────

const lineOption = computed<EChartsOption>(() => ({
  title: { text: '近30天采集趋势', left: 'left', textStyle: { fontSize: 14 } },
  tooltip: { trigger: 'axis' },
  grid: { left: 40, right: 24, top: 48, bottom: 32 },
  xAxis: {
    type: 'category',
    data: trend.value.map((b) => b.date),
    axisLabel: { interval: 4, fontSize: 11 },
  },
  yAxis: { type: 'value', minInterval: 1, axisLabel: { fontSize: 11 } },
  series: [
    {
      name: '采集数',
      type: 'line',
      smooth: true,
      data: trend.value.map((b) => b.count),
      areaStyle: { opacity: 0.18 },
      itemStyle: { color: '#409eff' },
      lineStyle: { width: 2 },
    },
  ],
}));

const barOption = computed<EChartsOption>(() => ({
  title: { text: '各经理本月采集量', left: 'left', textStyle: { fontSize: 14 } },
  tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
  grid: { left: 48, right: 24, top: 48, bottom: 56 },
  xAxis: {
    type: 'category',
    data: byManager.value.map((b) => b.name),
    axisLabel: { fontSize: 11, rotate: byManager.value.length > 5 ? 30 : 0 },
  },
  yAxis: { type: 'value', minInterval: 1, axisLabel: { fontSize: 11 } },
  series: [
    {
      name: '采集数',
      type: 'bar',
      data: byManager.value.map((b) => b.count),
      itemStyle: { color: '#67c23a', borderRadius: [4, 4, 0, 0] },
      barMaxWidth: 32,
    },
  ],
}));

const pieOption = computed<EChartsOption>(() => {
  const collected = coverage.value.collected;
  const uncollected = coverage.value.uncollected;
  return {
    title: { text: '客户覆盖情况', left: 'left', textStyle: { fontSize: 14 } },
    tooltip: {
      trigger: 'item',
      formatter: '{b}: {c} ({d}%)',
    },
    legend: { bottom: 8, left: 'center' },
    series: [
      {
        name: '客户覆盖',
        type: 'pie',
        radius: ['45%', '70%'],
        center: ['50%', '52%'],
        avoidLabelOverlap: true,
        itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 },
        label: { formatter: '{b}\n{c} ({d}%)', fontSize: 12 },
        data: [
          { value: collected, name: '已采集', itemStyle: { color: '#409eff' } },
          { value: uncollected, name: '未采集', itemStyle: { color: '#e6e6e6' } },
        ],
      },
    ],
  };
});

// ─── Lifecycle ──────────────────────────────────────────────────────────────

onMounted(loadDashboard);
</script>

<template>
  <div class="dashboard-page" v-loading="loading">
    <header class="page-header">
      <h2>采集进度看板</h2>
      <el-button type="primary" @click="loadDashboard">刷新</el-button>
    </header>

    <!-- ─── KPI cards ──────────────────────────────────────────────────── -->
    <el-row :gutter="16" class="kpi-row">
      <el-col :xs="24" :sm="12" :md="6">
        <el-card shadow="never" class="kpi-card">
          <div class="kpi-inner">
            <el-icon class="kpi-icon kpi-icon-blue"><Calendar /></el-icon>
            <div class="kpi-text">
              <div class="kpi-label">今日采集数</div>
              <div class="kpi-value">{{ kpi.today }}</div>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :xs="24" :sm="12" :md="6">
        <el-card shadow="never" class="kpi-card">
          <div class="kpi-inner">
            <el-icon class="kpi-icon kpi-icon-green">
              <DataAnalysis />
            </el-icon>
            <div class="kpi-text">
              <div class="kpi-label">本月采集数</div>
              <div class="kpi-value">{{ kpi.month }}</div>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :xs="24" :sm="12" :md="6">
        <el-card shadow="never" class="kpi-card">
          <div class="kpi-inner">
            <el-icon class="kpi-icon kpi-icon-orange">
              <Position />
            </el-icon>
            <div class="kpi-text">
              <div class="kpi-label">已核实率</div>
              <div class="kpi-value">
                {{ kpi.verifiedRate }}%
                <span class="kpi-sub">
                  ({{ kpi.verifiedCount }}/{{ kpi.monthTotal }})
                </span>
              </div>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :xs="24" :sm="12" :md="6">
        <el-card shadow="never" class="kpi-card">
          <div class="kpi-inner">
            <el-icon class="kpi-icon kpi-icon-purple"><UserFilled /></el-icon>
            <div class="kpi-text">
              <div class="kpi-label">待同步总数</div>
              <div class="kpi-value">{{ kpi.pendingSync }}</div>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- ─── Charts ─────────────────────────────────────────────────────── -->
    <el-row :gutter="16" class="chart-row">
      <el-col :xs="24" :md="16">
        <el-card shadow="never" class="chart-card">
          <VChart class="chart" :option="lineOption" autoresize />
        </el-card>
      </el-col>
      <el-col :xs="24" :md="8">
        <el-card shadow="never" class="chart-card">
          <VChart class="chart" :option="pieOption" autoresize />
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="16" class="chart-row">
      <el-col :span="24">
        <el-card shadow="never" class="chart-card">
          <VChart class="chart" :option="barOption" autoresize />
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<style scoped>
.dashboard-page {
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
.kpi-row {
  margin: 0;
}
.kpi-row :deep(.el-col) {
  margin-bottom: 12px;
}
.kpi-card {
  border-radius: 4px;
}
.kpi-inner {
  display: flex;
  align-items: center;
  gap: 16px;
}
.kpi-icon {
  font-size: 36px;
  padding: 8px;
  border-radius: 8px;
  color: #fff;
}
.kpi-icon-blue {
  background: #409eff;
}
.kpi-icon-green {
  background: #67c23a;
}
.kpi-icon-orange {
  background: #e6a23c;
}
.kpi-icon-purple {
  background: #909399;
}
.kpi-text {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.kpi-label {
  font-size: 13px;
  color: #909399;
}
.kpi-value {
  font-size: 24px;
  font-weight: 600;
  color: #303133;
}
.kpi-sub {
  font-size: 12px;
  font-weight: 400;
  color: #909399;
  margin-left: 6px;
}
.chart-row {
  margin: 0;
}
.chart-row :deep(.el-col) {
  margin-bottom: 12px;
}
.chart-card {
  border-radius: 4px;
}
.chart {
  width: 100%;
  height: 400px;
}
</style>