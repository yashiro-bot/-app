<script setup lang="ts">
import { onLoad, onHide } from '@dcloudio/uni-app';
import { reactive, ref, computed } from 'vue';
import GpsBadge from '../../components/GpsBadge.vue';
import PhotoUploader from '../../components/PhotoUploader.vue';
import { listCigarSpecs, type CigarSpec } from '../../api/cigar-specs';
import { createCollection, type CollectionInput } from '../../api/collections';
import { getCurrentLocation, type LocationResult } from '../../utils/location';
import { OfflineQueue } from '../../utils/offline-queue';
import { uuid } from '../../utils/uuid';

interface RowInput {
  sales: number;
  looseActual: number;
  looseCounted: number;
  boxedActual: number;
  boxedCounted: number;
}

function emptyRow(): RowInput {
  return { sales: 0, looseActual: 0, looseCounted: 0, boxedActual: 0, boxedCounted: 0 };
}

const customerId = ref<number>(0);
const specs = ref<CigarSpec[]>([]);
const rows = reactive<Record<number, RowInput>>({});
const loading = ref(false);
const submitting = ref(false);
const accuracy = ref<number | null>(null);
const lastFix = ref<LocationResult | null>(null);
const gpsError = ref('');
const photos = ref<string[]>([]);

// ── Spec pagination ────────────────────────────────────

const currentIndex = ref(0);

const currentSpec = computed<CigarSpec | null>(() =>
  specs.value.length > 0 ? specs.value[currentIndex.value] ?? null : null,
);

const hasPrev = computed(() => currentIndex.value > 0);
const hasNext = computed(() => currentIndex.value < specs.value.length - 1);
const progressText = computed(() => {
  if (specs.value.length === 0) return '';
  return `${currentIndex.value + 1} / ${specs.value.length}`;
});

// ── Lifecycle ───────────────────────────────────────────

onLoad((query) => {
  const raw = query?.id;
  const id = Array.isArray(raw) ? Number(raw[0]) : Number(raw);
  customerId.value = Number.isFinite(id) && id > 0 ? id : 0;
  if (customerId.value === 0) {
    uni.showToast({ title: '客户 ID 缺失', icon: 'none' });
  }
  fetchSpecs();
  void refreshGps();
});

// Auto-save when page hides (phone call, app switch, etc.)
onHide(() => {
  autoSaveDraft();
});

// ── Data fetching ───────────────────────────────────────

async function fetchSpecs(): Promise<void> {
  try {
    specs.value = await listCigarSpecs();
  } catch (e) {
    uni.showToast({
      title: e instanceof Error ? e.message : '加载规格失败',
      icon: 'none',
    });
  }
}

async function refreshGps(): Promise<void> {
  if (loading.value) return;
  loading.value = true;
  gpsError.value = '';
  try {
    const fix = await getCurrentLocation();
    lastFix.value = fix;
    accuracy.value = fix.accuracy;
  } catch (e) {
    accuracy.value = null;
    lastFix.value = null;
    gpsError.value = e instanceof Error ? e.message : '定位失败';
    uni.showToast({ title: gpsError.value, icon: 'none', duration: 2000 });
  } finally {
    loading.value = false;
  }
}

// ── Spec navigation ─────────────────────────────────────

function ensureRow(specId: number): RowInput {
  if (!rows[specId]) rows[specId] = emptyRow();
  return rows[specId]!;
}

function onNumberInput(specId: number, key: keyof RowInput, event: Event): void {
  const detail = (event as { detail?: { value?: string | number } }).detail;
  const raw = detail?.value ?? '';
  const n = Number(raw);
  ensureRow(specId)[key] = Number.isFinite(n) && n >= 0 ? n : 0;
}

function goPrev(): void {
  if (!hasPrev.value) return;
  autoSaveDraft();
  currentIndex.value--;
}

function goNext(): void {
  if (!hasNext.value) return;
  autoSaveDraft();
  currentIndex.value++;
}

// ── Auto-save draft ─────────────────────────────────────

function buildDraftRecord() {
  const details: OfflineQueueDetail[] = [];
  for (const spec of specs.value) {
    const r = rows[spec.id];
    if (!r) continue;
    details.push({
      cigarSpecId: spec.id,
      salesQty: r.sales,
      actualStockLoose: r.looseActual,
      countedStockLoose: r.looseCounted,
      actualStockBoxed: r.boxedActual,
      countedStockBoxed: r.boxedCounted,
    });
  }
  // Only save if at least one field has data
  const hasData = details.some(
    (d) =>
      d.salesQty > 0 ||
      d.actualStockLoose > 0 ||
      d.countedStockLoose > 0 ||
      d.actualStockBoxed > 0 ||
      d.countedStockBoxed > 0,
  );
  if (!hasData) return;

  OfflineQueue.enqueue({
    customerId: customerId.value,
    gpsLat: lastFix.value?.latitude ?? 0,
    gpsLng: lastFix.value?.longitude ?? 0,
    gpsAccuracy: lastFix.value?.accuracy ?? 0,
    photoUrls: photos.value,
    collectedAt: new Date().toISOString(),
    details,
  });
}

interface OfflineQueueDetail {
  cigarSpecId: number;
  salesQty: number;
  actualStockLoose: number;
  countedStockLoose: number;
  actualStockBoxed: number;
  countedStockBoxed: number;
}

function autoSaveDraft(): void {
  if (customerId.value === 0) return;
  if (specs.value.length === 0) return;
  buildDraftRecord();
}

// ── Submit ──────────────────────────────────────────────

function buildPostPayload(): CollectionInput {
  const details: CollectionInput['details'] = [];
  for (const spec of specs.value) {
    const r = rows[spec.id];
    if (!r || r.sales <= 0) continue;
    details.push({ cigarSpecId: spec.id, quantity: r.sales });
  }
  return {
    clientUuid: uuid(),
    customerId: customerId.value,
    collectedAt: new Date().toISOString(),
    gpsLat: lastFix.value?.latitude ?? 0,
    gpsLng: lastFix.value?.longitude ?? 0,
    photoUrls: photos.value,
    details,
  };
}

async function onSubmit(): Promise<void> {
  if (submitting.value) return;
  if (customerId.value === 0) {
    uni.showToast({ title: '客户 ID 无效', icon: 'none' });
    return;
  }
  if (specs.value.length === 0) {
    uni.showToast({ title: '规格未加载', icon: 'none' });
    return;
  }
  if (photos.value.length === 0) {
    uni.showToast({ title: '至少添加 1 张照片', icon: 'none' });
    return;
  }

  // Final auto-save before submit
  autoSaveDraft();

  submitting.value = true;
  const payload = buildPostPayload();
  try {
    await createCollection(payload);
    uni.showToast({ title: '提交成功', icon: 'success' });
    setTimeout(() => uni.navigateBack(), 600);
  } catch (e) {
    OfflineQueue.enqueue({
      customerId: payload.customerId,
      gpsLat: payload.gpsLat,
      gpsLng: payload.gpsLng,
      gpsAccuracy: lastFix.value?.accuracy ?? 0,
      photoUrls: payload.photoUrls,
      collectedAt: payload.collectedAt,
      details: payload.details.map((d) => ({
        cigarSpecId: d.cigarSpecId,
        salesQty: d.quantity,
        actualStockLoose: 0,
        countedStockLoose: 0,
        actualStockBoxed: 0,
        countedStockBoxed: 0,
      })),
    });
    const msg = e instanceof Error ? e.message : '网络错误，已离线保存';
    uni.showToast({ title: `${msg}，已离线保存`, icon: 'none', duration: 2500 });
    setTimeout(() => uni.navigateBack(), 1500);
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <view class="collect-page">
    <!-- Header: customer info + GPS -->
    <view class="card header-card">
      <view class="card-title">采集信息</view>
      <view class="card-row">
        <text class="label">客户 ID：{{ customerId || '—' }}</text>
      </view>
      <view class="card-row gps-row">
        <GpsBadge :accuracy="accuracy" :loading="loading" />
        <button class="btn-secondary" :disabled="loading" @click="refreshGps">
          {{ loading ? '定位中...' : '重新定位' }}
        </button>
      </view>
      <view v-if="gpsError" class="error-text">{{ gpsError }}</view>
    </view>

    <!-- Photos -->
    <view class="card">
      <view class="card-title">
        现场照片
        <text class="card-subtitle">已添加 {{ photos.length }} 张照片</text>
      </view>
      <PhotoUploader v-model="photos" :max="9" />
    </view>

    <!-- Spec input (pagination) -->
    <view class="card spec-card">
      <view v-if="currentSpec" :key="currentSpec.id" class="spec-section">
        <view class="spec-head">
          <text class="spec-code">{{ currentSpec.code }}</text>
          <text class="spec-name">{{ currentSpec.name }}</text>
          <text class="spec-progress">{{ progressText }}</text>
        </view>

        <view class="input-grid">
          <view class="input-cell">
            <text class="input-label">销售</text>
            <input
              type="number"
              class="num-input"
              :value="String(rows[currentSpec.id]?.sales ?? 0)"
              @input="onNumberInput(currentSpec.id, 'sales', $event)"
            />
          </view>
          <view class="input-cell">
            <text class="input-label">裸养实</text>
            <input
              type="number"
              class="num-input"
              :value="String(rows[currentSpec.id]?.looseActual ?? 0)"
              @input="onNumberInput(currentSpec.id, 'looseActual', $event)"
            />
          </view>
          <view class="input-cell">
            <text class="input-label">裸养盘</text>
            <input
              type="number"
              class="num-input"
              :value="String(rows[currentSpec.id]?.looseCounted ?? 0)"
              @input="onNumberInput(currentSpec.id, 'looseCounted', $event)"
            />
          </view>
          <view class="input-cell">
            <text class="input-label">盒养实</text>
            <input
              type="number"
              class="num-input"
              :value="String(rows[currentSpec.id]?.boxedActual ?? 0)"
              @input="onNumberInput(currentSpec.id, 'boxedActual', $event)"
            />
          </view>
          <view class="input-cell">
            <text class="input-label">盒养盘</text>
            <input
              type="number"
              class="num-input"
              :value="String(rows[currentSpec.id]?.boxedCounted ?? 0)"
              @input="onNumberInput(currentSpec.id, 'boxedCounted', $event)"
            />
          </view>
        </view>
      </view>

      <!-- Navigation buttons -->
      <view class="nav-row">
        <button
          class="nav-btn nav-btn--prev"
          :disabled="!hasPrev"
          @click="goPrev"
        >
          上一页
        </button>
        <view class="nav-spacer" />
        <button
          class="nav-btn nav-btn--next"
          :disabled="!hasNext"
          @click="goNext"
        >
          下一页
        </button>
      </view>
    </view>

    <!-- Submit -->
    <view class="action-bar">
      <button
        class="btn-primary"
        :disabled="submitting || photos.length === 0"
        @click="onSubmit"
      >
        {{ submitting ? '提交中...' : '提交' }}
      </button>
    </view>
  </view>
</template>

<style scoped>
.collect-page {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background: #f5f6f8;
  padding-bottom: 100rpx;
}
.card {
  background: #ffffff;
  border-radius: 12rpx;
  padding: 24rpx;
  margin: 12rpx 16rpx;
  box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.04);
}
.header-card {
  padding: 28rpx 24rpx;
}
.card-title {
  font-size: 30rpx;
  font-weight: 600;
  color: #1a1a1a;
  margin-bottom: 16rpx;
}
.card-subtitle {
  font-size: 24rpx;
  font-weight: 400;
  color: #8a8a8a;
  margin-left: 12rpx;
}
.card-row {
  margin-bottom: 12rpx;
  font-size: 28rpx;
  color: #333333;
}
.gps-row {
  display: flex;
  align-items: center;
  gap: 16rpx;
}
.label {
  font-size: 28rpx;
  color: #333333;
}
.btn-secondary {
  background: #ffffff;
  color: #1989fa;
  border: 2rpx solid #1989fa;
  border-radius: 8rpx;
  padding: 8rpx 20rpx;
  font-size: 26rpx;
}
.btn-secondary[disabled] {
  color: #9bc7f5;
  border-color: #cfe3f7;
}
.error-text {
  margin-top: 8rpx;
  color: #c62828;
  font-size: 24rpx;
}

/* ── Spec section ─────────────────────────────────────── */

.spec-card {
  flex: 1;
  display: flex;
  flex-direction: column;
}
.spec-section {
  display: flex;
  flex-direction: column;
  flex: 1;
}
.spec-head {
  display: flex;
  align-items: baseline;
  gap: 12rpx;
  margin-bottom: 20rpx;
}
.spec-code {
  font-size: 22rpx;
  color: #999999;
  font-family: monospace;
}
.spec-name {
  font-size: 28rpx;
  font-weight: 600;
  color: #1a1a1a;
  flex: 1;
}
.spec-progress {
  font-size: 22rpx;
  color: #8a8a8a;
  background: #f0f4f8;
  padding: 4rpx 14rpx;
  border-radius: 20rpx;
}
.input-grid {
  display: flex;
  gap: 12rpx;
  flex-wrap: wrap;
}
.input-cell {
  flex: 1 1 calc(33.33% - 12rpx);
  min-width: 160rpx;
  display: flex;
  flex-direction: column;
}
.input-label {
  font-size: 22rpx;
  color: #888888;
  margin-bottom: 6rpx;
}
.num-input {
  width: 100%;
  height: 72rpx;
  padding: 0 12rpx;
  font-size: 28rpx;
  text-align: center;
  background: #f8f9fb;
  border: 2rpx solid #e6e8eb;
  border-radius: 8rpx;
  box-sizing: border-box;
}

/* ── Navigation ───────────────────────────────────────── */

.nav-row {
  display: flex;
  gap: 16rpx;
  margin-top: auto;
  padding-top: 20rpx;
}
.nav-btn {
  flex: 1;
  height: 72rpx;
  border-radius: 8rpx;
  font-size: 28rpx;
  border: none;
}
.nav-btn--prev {
  background: #ffffff;
  color: #1989fa;
  border: 2rpx solid #1989fa;
}
.nav-btn--next {
  background: #1989fa;
  color: #ffffff;
}
.nav-btn[disabled] {
  opacity: 0.4;
}
.nav-spacer {
  width: 0;
}

/* ── Action bar ───────────────────────────────────────── */

.action-bar {
  padding: 16rpx;
  background: #ffffff;
  border-top: 2rpx solid #e6e8eb;
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 100;
}
.btn-primary {
  width: 100%;
  height: 88rpx;
  border-radius: 8rpx;
  font-size: 32rpx;
  background: linear-gradient(135deg, #1989fa, #07c160);
  color: #ffffff;
  border: none;
}
.btn-primary[disabled] {
  opacity: 0.5;
}
</style>
