<script setup lang="ts">
import { ref } from 'vue';
import GpsBadge from '../../components/GpsBadge.vue';
import { getCurrentLocation, type LocationResult } from '../../utils/location';

/**
 * Collect page (placeholder).
 *
 * T17 wiring: a single "Test GPS" button requests a fix via
 * `getCurrentLocation()` and renders the result through `<GpsBadge>`.
 * This page is still a placeholder — the real collection form / SKU
 * grid / photo upload flow will land in later waves (T18+). For now
 * the GPS path is end-to-end exercised so we can confirm the native
 * geo module + gcj02 frame work on a real device build.
 */

const accuracy = ref<number | null>(null);
const loading = ref(false);
const lastFix = ref<LocationResult | null>(null);
const errorMessage = ref('');

async function onTestGps(): Promise<void> {
  // Guard against double-tap while a fix is in flight.
  if (loading.value) return;
  loading.value = true;
  errorMessage.value = '';
  try {
    const fix = await getCurrentLocation();
    lastFix.value = fix;
    accuracy.value = fix.accuracy;
    uni.showToast({
      title: `GPS: ${fix.latitude.toFixed(5)}, ${fix.longitude.toFixed(5)}`,
      icon: 'none',
      duration: 1500,
    });
  } catch (e) {
    accuracy.value = null;
    errorMessage.value = e instanceof Error ? e.message : '定位失败';
    uni.showToast({
      title: errorMessage.value,
      icon: 'none',
      duration: 2500,
    });
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <view class="collect-page">
    <view class="card">
      <view class="card-title">GPS 定位测试</view>
      <view class="card-row">
        <GpsBadge :accuracy="accuracy" :loading="loading" />
      </view>
      <button
        class="btn-primary"
        :disabled="loading"
        @click="onTestGps"
      >
        {{ loading ? '定位中...' : 'Test GPS' }}
      </button>
      <view v-if="lastFix" class="fix-detail">
        <view>纬度：{{ lastFix.latitude.toFixed(6) }}</view>
        <view>经度：{{ lastFix.longitude.toFixed(6) }}</view>
        <view>精度：{{ Math.round(lastFix.accuracy) }} m</view>
        <view>时间：{{ new Date(lastFix.timestamp).toLocaleTimeString() }}</view>
      </view>
      <view v-if="errorMessage" class="error-text">{{ errorMessage }}</view>
    </view>

    <view class="placeholder-note">
      采集表单 / SKU 录入 / 拍照上传将在后续任务（T18+）接入。
    </view>
  </view>
</template>

<style scoped>
.collect-page {
  padding: 16px;
}
.card {
  background: #ffffff;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 12px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.05);
}
.card-title {
  font-size: 16px;
  font-weight: 600;
  color: #333333;
  margin-bottom: 12px;
}
.card-row {
  margin-bottom: 12px;
}
.btn-primary {
  background: #1989fa;
  color: #ffffff;
  border-radius: 6px;
  padding: 10px 16px;
  font-size: 15px;
  border: none;
}
.btn-primary[disabled] {
  background: #9bc7f5;
}
.fix-detail {
  margin-top: 12px;
  padding: 10px;
  background: #f6f8fa;
  border-radius: 6px;
  font-size: 13px;
  color: #555555;
  line-height: 1.7;
  font-family: monospace;
}
.error-text {
  margin-top: 10px;
  color: #c62828;
  font-size: 13px;
}
.placeholder-note {
  margin-top: 24px;
  text-align: center;
  color: #999999;
  font-size: 13px;
}
</style>