<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { http } from '../utils/request';
import {
  createMapController,
  type MapCollection,
} from '../composables/useMap';
import MapFilters from '../components/MapFilters.vue';
import MapSummary from '../components/MapSummary.vue';

// ─── Types ────────────────────────────────────────────────────────────────

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

type VerifiedFilter = '' | 'true' | 'false';

interface FilterState {
  managerId: number | null;
  dateRange: [string, string] | null;
  isVerified: VerifiedFilter;
}

const EMPTY_FILTER: FilterState = {
  managerId: null,
  dateRange: null,
  isVerified: '',
};

const FETCH_PAGE_SIZE = 1000;

// ─── State ────────────────────────────────────────────────────────────────

const managers = ref<ManagerOption[]>([]);
const collections = ref<MapCollection[]>([]);
const loading = ref<boolean>(false);
const mapContainer = ref<HTMLDivElement | null>(null);
const controller = createMapController();

const filter = reactive<FilterState>({
  managerId: null,
  dateRange: null,
  isVerified: '',
});

const summary = computed<{ total: number; verified: number; unverified: number }>(
  () => {
    const total = collections.value.length;
    const verified = collections.value.filter((c) => c.isVerified).length;
    return { total, verified, unverified: total - verified };
  },
);

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

async function fetchCollections(): Promise<void> {
  loading.value = true;
  try {
    const params: Record<string, string | number | boolean> = {
      page: 1,
      pageSize: FETCH_PAGE_SIZE,
    };
    if (filter.managerId !== null) params.managerId = filter.managerId;
    if (filter.dateRange !== null) {
      params.fromDate = filter.dateRange[0];
      params.toDate = filter.dateRange[1];
    }
    if (filter.isVerified !== '') {
      params.isVerified = filter.isVerified === 'true';
    }
    const res = await http.get<ListResponse<MapCollection>>('/collections', {
      params,
    });
    collections.value = res.data.data;
    controller.renderMarkers(collections.value);
  } catch {
    ElMessage.error('采集记录加载失败');
    collections.value = [];
    controller.renderMarkers(collections.value);
  } finally {
    loading.value = false;
  }
}

// ─── Filter handlers ──────────────────────────────────────────────────────

function onQuery(): void {
  void fetchCollections();
}

function onReset(): void {
  filter.managerId = EMPTY_FILTER.managerId;
  filter.dateRange = EMPTY_FILTER.dateRange;
  filter.isVerified = EMPTY_FILTER.isVerified;
  void fetchCollections();
}

// ─── Lifecycle ────────────────────────────────────────────────────────────

onMounted(() => {
  // Leaflet needs the container mounted with computed dimensions.
  setTimeout(() => {
    if (mapContainer.value !== null) controller.init(mapContainer.value);
    void fetchManagers().then(() => {
      void fetchCollections();
    });
  }, 0);
});

onBeforeUnmount(() => {
  controller.destroy();
});
</script>

<template>
  <div class="map-page">
    <header class="page-header">
      <h2>GPS 核实地图</h2>
    </header>

    <MapFilters
      :filter="filter"
      :managers="managers"
      :loading="loading"
      @query="onQuery"
      @reset="onReset"
    />

    <MapSummary :summary="summary" />

    <el-card shadow="never" class="map-card">
      <div ref="mapContainer" class="map-container" v-loading="loading" />
      <div
        v-if="!loading && collections.length > 0"
        class="legend"
        aria-label="图例"
      >
        <span class="legend-item">
          <span class="dot dot-verified" /> 已核实
        </span>
        <span class="legend-item">
          <span class="dot dot-unverified" /> 未核实
        </span>
      </div>
      <div v-if="!loading && collections.length === 0" class="empty-tip">
        当前筛选条件下暂无采集记录
      </div>
    </el-card>
  </div>
</template>

<style scoped>
.map-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
  height: 100%;
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
.map-card {
  border-radius: 4px;
  flex: 1;
  min-height: 600px;
  display: flex;
  flex-direction: column;
  position: relative;
}
.map-container {
  width: 100%;
  height: 600px;
  border-radius: 4px;
  overflow: hidden;
}
.legend {
  position: absolute;
  bottom: 16px;
  right: 16px;
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid #e4e7ed;
  border-radius: 4px;
  padding: 6px 12px;
  display: flex;
  gap: 16px;
  font-size: 12px;
  color: #606266;
  z-index: 400;
}
.legend-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.empty-tip {
  text-align: center;
  color: #909399;
  padding: 16px 0;
  font-size: 13px;
}
</style>

<style>
.leaflet-popup-content {
  margin: 10px 12px;
}
</style>