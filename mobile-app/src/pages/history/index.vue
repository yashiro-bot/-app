<script setup lang="ts">
import { computed, ref } from 'vue';
import { onShow, onPullDownRefresh } from '@dcloudio/uni-app';
import {
  listCollections,
  type CollectionListItem,
  type ListCollectionsParams,
} from '../../api/collections';
import { formatDistance, formatTime } from '../../utils/format';

/**
 * Collection history list page.
 *
 *  - onShow: re-fetch (covers tab-switch back from collect page).
 *  - Pull-down refresh: re-fetches the first page and stops the spinner.
 *  - Tap a card: navigate to /pages/history/detail?id=X.
 *  - Distance: <1000m → "XX米", >=1000m → "X.X公里".
 *  - Verified → green "已核实" badge, otherwise red "未核实".
 */

const items = ref<CollectionListItem[]>([]);
const loading = ref(false);
const errorMessage = ref('');
const refreshing = ref(false);

const PAGE_SIZE = 20;

async function fetchList(params: ListCollectionsParams = {}): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    const res = await listCollections({ page: 1, pageSize: PAGE_SIZE, ...params });
    items.value = res.data;
  } catch (e) {
    const status = (e as { response?: { status?: number } })?.response?.status;
    if (status === 401) {
      // request.ts interceptor already redirects to /pages/login on 401;
      // surface a toast for the brief moment before the reLaunch runs.
      uni.showToast({ title: '请重新登录', icon: 'none' });
    } else {
      uni.showToast({ title: '加载采集记录失败', icon: 'none' });
    }
    items.value = [];
    errorMessage.value = status === 401 ? '请重新登录' : '加载采集记录失败';
  } finally {
    loading.value = false;
  }
}

async function onRefresh(): Promise<void> {
  refreshing.value = true;
  try {
    await fetchList();
  } finally {
    refreshing.value = false;
    uni.stopPullDownRefresh();
  }
}

function onCardTap(item: CollectionListItem): void {
  if (loading.value) return;
  uni.navigateTo({ url: `/pages/history/detail?id=${item.id}` });
}

const hasAny = computed(() => items.value.length > 0);

onShow(() => {
  void fetchList();
});
onPullDownRefresh(onRefresh);
</script>

<template>
  <view class="history-page">
    <view v-if="loading && !hasAny && !refreshing" class="state state-loading">
      <view class="state-text">加载中...</view>
    </view>

    <view v-else-if="errorMessage && !hasAny" class="state state-error">
      <view class="state-text">{{ errorMessage }}</view>
      <button class="retry-btn" @click="fetchList()">重试</button>
    </view>

    <view v-else-if="!hasAny" class="state state-empty">
      <view class="state-emoji">📭</view>
      <view class="state-text">暂无采集记录</view>
    </view>

    <view v-else class="card-list">
      <view
        v-for="c in items"
        :key="c.id"
        class="card"
        @click="onCardTap(c)"
      >
        <view class="card-row card-row--top">
          <view class="card-name">{{ c.customer.name }}</view>
          <view
            class="badge"
            :class="c.isVerified ? 'badge--verified' : 'badge--unverified'"
          >
            {{ c.isVerified ? '已核实' : '未核实' }}
          </view>
        </view>
        <view class="card-row card-row--meta">
          <text class="meta-label">采集时间：</text>
          <text class="meta-value">{{ formatTime(c.collectedAt) }}</text>
        </view>
        <view class="card-row card-row--meta">
          <text class="meta-label">距离客户：</text>
          <text class="meta-value">{{ formatDistance(c.distanceToCustomerM) }}</text>
        </view>
      </view>
    </view>
  </view>
</template>

<style scoped>
.history-page {
  min-height: 100vh;
  background-color: #f5f6fa;
  padding: 16rpx 24rpx 32rpx;
  box-sizing: border-box;
}

.state {
  padding: 96rpx 32rpx;
  text-align: center;
}

.state-emoji {
  font-size: 72rpx;
  margin-bottom: 16rpx;
}

.state-text {
  font-size: 28rpx;
  color: #8a8a8a;
}

.state-error .state-text {
  color: #c62828;
  margin-bottom: 24rpx;
}

.retry-btn {
  display: inline-block;
  background-color: #1989fa;
  color: #ffffff;
  font-size: 26rpx;
  border-radius: 8rpx;
  padding: 12rpx 40rpx;
  border: none;
}

.retry-btn::after {
  border: none;
}

.card-list {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.card {
  background-color: #ffffff;
  border-radius: 12rpx;
  padding: 24rpx;
  box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.04);
}

.card:active {
  transform: scale(0.99);
  background-color: #f0f4f8;
}

.card-row {
  margin-bottom: 8rpx;
}

.card-row:last-child {
  margin-bottom: 0;
}

.card-row--top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12rpx;
}

.card-name {
  font-size: 32rpx;
  font-weight: 600;
  color: #1a1a1a;
  flex: 1;
  margin-right: 16rpx;
  word-break: break-all;
}

.badge {
  font-size: 22rpx;
  padding: 4rpx 14rpx;
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

.card-row--meta {
  display: flex;
  font-size: 26rpx;
  color: #606266;
}

.meta-label {
  color: #8a8a8a;
}

.meta-value {
  color: #303133;
}
</style>