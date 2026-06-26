<script setup lang="ts">
import { onBeforeUnmount, ref } from "vue";
import { onPendingCountChange, manualSync } from "@/utils/sync";

const pendingCount = ref(0);
const syncing = ref(false);

const unsubscribe = onPendingCountChange((count) => {
  pendingCount.value = count;
});

async function handleManualSync(): Promise<void> {
  if (syncing.value) return;
  syncing.value = true;
  try {
    await manualSync();
    uni.showToast({ title: "同步完成", icon: "success" });
  } catch (e) {
    uni.showToast({ title: "同步失败，请重试", icon: "none" });
    console.warn("[profile] manualSync failed", e);
  } finally {
    syncing.value = false;
  }
}

onBeforeUnmount(() => {
  unsubscribe();
});
</script>

<template>
  <view class="profile-page">
    <view class="card pending-card">
      <view class="pending-label">待同步记录</view>
      <view v-if="pendingCount > 0" class="pending-badge">
        <text class="pending-count">{{ pendingCount }}</text>
      </view>
      <view v-else class="pending-empty">无待同步</view>
    </view>

    <button
      class="sync-btn"
      :disabled="syncing"
      :loading="syncing"
      @click="handleManualSync"
    >
      {{ syncing ? "同步中..." : "立即同步" }}
    </button>
  </view>
</template>

<style scoped>
.profile-page {
  padding: 24rpx;
}
.card {
  background: #fff;
  border-radius: 16rpx;
  padding: 32rpx;
  margin-bottom: 24rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.pending-label {
  font-size: 32rpx;
  color: #333;
}
.pending-badge {
  background: #f56c6c;
  color: #fff;
  border-radius: 999rpx;
  padding: 4rpx 20rpx;
  min-width: 48rpx;
  text-align: center;
}
.pending-count {
  font-size: 28rpx;
  color: #fff;
}
.pending-empty {
  font-size: 28rpx;
  color: #999;
}
.sync-btn {
  background: #409eff;
  color: #fff;
  border-radius: 12rpx;
  font-size: 32rpx;
}
</style>
