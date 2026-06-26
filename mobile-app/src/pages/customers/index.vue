<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { onShow, onPullDownRefresh } from '@dcloudio/uni-app';
import { listCustomers, type Customer } from '../../api/customers';

/**
 * Customer list page.
 *
 *  - onShow / onMounted: fetch the full (small) list once.
 *  - Search input: filters the in-memory list client-side — no per-keystroke
 *    refetch.
 *  - Pull-down refresh: re-fetches the full list and updates the cache.
 *  - Tap a row: navigate to the collect page with the customer id in the
 *    query string.
 */

const allCustomers = ref<Customer[]>([]);
const searchText = ref('');
const loading = ref(false);
const errorMessage = ref('');

const filtered = computed<Customer[]>(() => {
  const q = searchText.value.trim().toLowerCase();
  if (q === '') return allCustomers.value;
  return allCustomers.value.filter((c) => {
    if (c.code.toLowerCase().includes(q)) return true;
    if (c.name.toLowerCase().includes(q)) return true;
    if (c.address !== null && c.address.toLowerCase().includes(q)) return true;
    return false;
  });
});

async function loadCustomers(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    const res = await listCustomers({ page: 1, pageSize: 100 });
    allCustomers.value = res.data;
  } catch (e) {
    const status = (e as { response?: { status?: number } })?.response?.status;
    if (status === 401) {
      // request.ts interceptor already redirects to /pages/login on 401;
      // surface a toast for the brief moment before the reLaunch runs.
      uni.showToast({ title: '请重新登录', icon: 'none' });
    } else {
      uni.showToast({ title: '加载客户失败', icon: 'none' });
    }
    allCustomers.value = [];
    errorMessage.value = status === 401 ? '请重新登录' : '加载客户失败';
  } finally {
    loading.value = false;
  }
}

function onRowTap(customer: Customer): void {
  if (loading.value) return;
  uni.navigateTo({ url: `/pages/collect/index?id=${customer.id}` });
}

function onRefresh(): Promise<void> {
  return loadCustomers().finally(() => {
    uni.stopPullDownRefresh();
  });
}

// Initial fetch on first mount + every onShow (covers tab-switch back).
onMounted(loadCustomers);
onShow(loadCustomers);
onPullDownRefresh(onRefresh);
</script>

<template>
  <view class="customers-page">
    <view class="search-bar">
      <input
        v-model="searchText"
        class="search-input"
        type="text"
        placeholder="搜索编号 / 名称 / 地址"
        placeholder-class="search-placeholder"
        :disabled="loading"
        :maxlength="64"
        confirm-type="search"
      />
      <view v-if="searchText" class="search-clear" @click="searchText = ''">
        ✕
      </view>
    </view>

    <view v-if="loading && allCustomers.length === 0" class="state state-loading">
      <view class="state-text">加载中...</view>
    </view>

    <view v-else-if="errorMessage && allCustomers.length === 0" class="state state-error">
      <view class="state-text">{{ errorMessage }}</view>
      <button class="retry-btn" @click="loadCustomers">重试</button>
    </view>

    <view v-else-if="filtered.length === 0" class="state state-empty">
      <view class="state-emoji">📋</view>
      <view class="state-text">暂无分配的客户</view>
    </view>

    <view v-else class="card-list">
      <view
        v-for="c in filtered"
        :key="c.id"
        class="card"
        :class="{ 'card--disabled': c.status === 'DISABLED' }"
        @click="onRowTap(c)"
      >
        <view class="card-row card-row--top">
          <view class="card-code">{{ c.code }}</view>
          <view class="card-status">
            {{ c.status === 'ACTIVE' ? '营业中' : '已停用' }}
          </view>
        </view>
        <view class="card-name">{{ c.name }}</view>
        <view v-if="c.address" class="card-address">
          📍 {{ c.address }}
        </view>
        <view v-if="c.contact || c.phone" class="card-contact">
          <text v-if="c.contact">👤 {{ c.contact }}</text>
          <text v-if="c.phone" class="card-phone">📞 {{ c.phone }}</text>
        </view>
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.customers-page {
  min-height: 100vh;
  background-color: #f5f6fa;
  padding: 16rpx 24rpx 32rpx;
  box-sizing: border-box;
}

.search-bar {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  background-color: #ffffff;
  border-radius: 12rpx;
  padding: 0 20rpx;
  height: 72rpx;
  margin-bottom: 16rpx;
  box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.04);
}

.search-input {
  flex: 1;
  height: 72rpx;
  font-size: 28rpx;
  color: #1a1a1a;
  background: transparent;
  border: none;
}

.search-input[disabled] {
  color: #b5b5b5;
}

.search-placeholder {
  color: #b5b5b5;
}

.search-clear {
  width: 48rpx;
  height: 48rpx;
  line-height: 48rpx;
  text-align: center;
  color: #8a8a8a;
  font-size: 28rpx;
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
  transition: transform 0.1s ease;
}

.card:active {
  transform: scale(0.99);
  background-color: #f0f4f8;
}

.card--disabled {
  opacity: 0.55;
}

.card-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8rpx;
}

.card-code {
  display: inline-block;
  background-color: #e8f3ff;
  color: #1989fa;
  font-size: 22rpx;
  padding: 4rpx 14rpx;
  border-radius: 16rpx;
  font-weight: 500;
}

.card-status {
  font-size: 22rpx;
  color: #67c23a;
}

.card--disabled .card-status {
  color: #909399;
}

.card-name {
  font-size: 32rpx;
  font-weight: 600;
  color: #1a1a1a;
  margin-bottom: 6rpx;
}

.card-address {
  font-size: 26rpx;
  color: #8a8a8a;
  margin-bottom: 4rpx;
  word-break: break-all;
}

.card-contact {
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;
  font-size: 24rpx;
  color: #606266;
  margin-top: 6rpx;
}

.card-phone {
  color: #606266;
}
</style>
