<script setup lang="ts">
import { ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { getCollection, type CollectionDetail } from '../../api/collections';
import { formatDistance, formatTime } from '../../utils/format';
import SpecTable from '../../components/SpecTable.vue';

/**
 * Single collection visit detail page.
 *
 *  - Reads `id` from the page query via onLoad.
 *  - Fetches GET /collections/:id (manager-scoped on the backend).
 *  - Header card: customer, manager, time, distance, verified badge.
 *  - Spec table: <SpecTable> renders the ≤45 row × 5 quantity grid.
 *  - Back button: provided by the uni-app navigation bar.
 */

const detail = ref<CollectionDetail | null>(null);
const loading = ref(false);
const errorMessage = ref('');

function readIdFromQuery(query: Record<string, unknown> | undefined): number {
  const raw = query?.['id'];
  const first = Array.isArray(raw) ? raw[0] : raw;
  const n = Number(first);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

async function loadDetail(id: number): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    detail.value = await getCollection(id);
  } catch (e) {
    const status = (e as { response?: { status?: number } })?.response?.status;
    if (status === 404) {
      errorMessage.value = '采集记录不存在或已删除';
    } else if (status === 403) {
      errorMessage.value = '无权查看此采集记录';
    } else if (status === 401) {
      // request.ts interceptor handles the reLaunch; toast is for the gap.
      uni.showToast({ title: '请重新登录', icon: 'none' });
      errorMessage.value = '请重新登录';
    } else {
      errorMessage.value = '加载详情失败';
    }
    detail.value = null;
  } finally {
    loading.value = false;
  }
}

onLoad((query) => {
  const id = readIdFromQuery(query);
  if (id === 0) {
    errorMessage.value = '采集记录 ID 缺失';
    uni.showToast({ title: '记录 ID 缺失', icon: 'none' });
    return;
  }
  void loadDetail(id);
});
</script>

<template>
  <view class="detail-page">
    <view v-if="loading && !detail" class="state state-loading">
      <view class="state-text">加载中...</view>
    </view>

    <view v-else-if="errorMessage && !detail" class="state state-error">
      <view class="state-text">{{ errorMessage }}</view>
    </view>

    <template v-else-if="detail">
      <view class="card header-card">
        <view class="header-row">
          <view class="header-name">{{ detail.customer.name }}</view>
          <view
            class="badge"
            :class="detail.isVerified ? 'badge--verified' : 'badge--unverified'"
          >
            {{ detail.isVerified ? '已核实 ✅' : '未核实 ❌' }}
          </view>
        </view>
        <view v-if="detail.customer.address" class="header-address">
          📍 {{ detail.customer.address }}
        </view>

        <view class="info-grid">
          <view class="info-item">
            <text class="info-label">客户经理</text>
            <text class="info-value">{{ detail.manager.name }}</text>
          </view>
          <view class="info-item">
            <text class="info-label">采集时间</text>
            <text class="info-value">{{ formatTime(detail.collectedAt) }}</text>
          </view>
          <view class="info-item">
            <text class="info-label">距离客户</text>
            <text class="info-value">{{ formatDistance(detail.distanceToCustomerM) }}</text>
          </view>
          <view class="info-item">
            <text class="info-label">GPS 精度</text>
            <text class="info-value">
              {{ detail.gpsAccuracy !== null ? `${Math.round(detail.gpsAccuracy)}米` : '—' }}
            </text>
          </view>
        </view>
      </view>

      <view class="card specs-card">
        <view class="specs-title">
          规格明细
          <text class="specs-count">（{{ detail.details.length }}）</text>
        </view>
        <SpecTable :details="detail.details" />
      </view>
    </template>
  </view>
</template>

<style scoped>
.detail-page {
  min-height: 100vh;
  background-color: #f5f6fa;
  padding: 16rpx 24rpx 32rpx;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
}
.state {
  padding: 96rpx 32rpx;
  text-align: center;
}
.state-text {
  font-size: 28rpx;
  color: #8a8a8a;
}
.state-error .state-text {
  color: #c62828;
}
.card {
  background-color: #ffffff;
  border-radius: 12rpx;
  padding: 24rpx;
  box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.04);
  margin-bottom: 16rpx;
}
.header-card {
  padding: 28rpx 24rpx;
}
.header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
  margin-bottom: 8rpx;
}
.header-name {
  font-size: 36rpx;
  font-weight: 600;
  color: #1a1a1a;
  flex: 1;
  word-break: break-all;
}
.header-address {
  font-size: 26rpx;
  color: #8a8a8a;
  margin-bottom: 16rpx;
  word-break: break-all;
}
.info-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx 24rpx;
  margin-top: 8rpx;
}
.info-item {
  flex: 1 1 calc(50% - 12rpx);
  min-width: 240rpx;
  display: flex;
  flex-direction: column;
}
.info-label {
  font-size: 22rpx;
  color: #8a8a8a;
  margin-bottom: 4rpx;
}
.info-value {
  font-size: 28rpx;
  color: #303133;
}
.badge {
  font-size: 22rpx;
  padding: 6rpx 16rpx;
  border-radius: 16rpx;
  font-weight: 500;
  white-space: nowrap;
}
.badge--verified {
  background-color: #e1f3d8;
  color: #67c23a;
}
.badge--unverified {
  background-color: #fde2e2;
  color: #f56c6c;
}
.specs-card {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 20rpx 16rpx;
}
.specs-title {
  font-size: 30rpx;
  font-weight: 600;
  color: #1a1a1a;
  margin-bottom: 12rpx;
  padding: 0 8rpx;
}
.specs-count {
  font-size: 24rpx;
  font-weight: 400;
  color: #8a8a8a;
  margin-left: 6rpx;
}
</style>