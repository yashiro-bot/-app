<script setup lang="ts">
import { onLoad } from '@dcloudio/uni-app';
import { reactive, ref } from 'vue';
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

function buildOfflineRecord(clientUuid: string) {
  const details: {
    cigarSpecId: number;
    salesQty: number;
    actualStockLoose: number;
    countedStockLoose: number;
    actualStockBoxed: number;
    countedStockBoxed: number;
  }[] = [];
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
  return {
    clientUuid,
    customerId: customerId.value,
    gpsLat: lastFix.value?.latitude ?? 0,
    gpsLng: lastFix.value?.longitude ?? 0,
    gpsAccuracy: lastFix.value?.accuracy ?? 0,
    photoUrls: photos.value,
    collectedAt: new Date().toISOString(),
    details,
  };
}

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

function onSaveDraft(): void {
  if (submitting.value) return;
  if (specs.value.length === 0) {
    uni.showToast({ title: '规格未加载', icon: 'none' });
    return;
  }
  const record = buildOfflineRecord('placeholder');
  OfflineQueue.enqueue({
    customerId: record.customerId,
    gpsLat: record.gpsLat,
    gpsLng: record.gpsLng,
    gpsAccuracy: record.gpsAccuracy,
    photoUrls: record.photoUrls,
    collectedAt: record.collectedAt,
    details: record.details,
  });
  uni.showToast({ title: '已保存草稿', icon: 'success' });
  setTimeout(() => uni.navigateBack(), 600);
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
    <view class="card">
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

    <view class="card">
      <view class="card-title">
        现场照片
        <text class="card-subtitle">已添加 {{ photos.length }} 张照片 (至少 1 张必填)</text>
      </view>
      <PhotoUploader v-model="photos" :max="9" />
    </view>

    <view class="card">
      <view class="card-title">规格明细（{{ specs.length }}）</view>
      <scroll-view scroll-y class="spec-scroll">
        <view v-for="spec in specs" :key="spec.id" class="spec-row">
          <view class="spec-head">
            <text class="spec-code">{{ spec.code }}</text>
            <text class="spec-name">{{ spec.name }}</text>
          </view>
          <view class="input-grid">
            <view class="input-cell">
              <text class="input-label">销售</text>
              <input
                type="number"
                class="num-input"
                :value="String(rows[spec.id]?.sales ?? 0)"
                @input="onNumberInput(spec.id, 'sales', $event)"
              />
            </view>
            <view class="input-cell">
              <text class="input-label">裸养实</text>
              <input
                type="number"
                class="num-input"
                :value="String(rows[spec.id]?.looseActual ?? 0)"
                @input="onNumberInput(spec.id, 'looseActual', $event)"
              />
            </view>
            <view class="input-cell">
              <text class="input-label">裸养盘</text>
              <input
                type="number"
                class="num-input"
                :value="String(rows[spec.id]?.looseCounted ?? 0)"
                @input="onNumberInput(spec.id, 'looseCounted', $event)"
              />
            </view>
            <view class="input-cell">
              <text class="input-label">盒养实</text>
              <input
                type="number"
                class="num-input"
                :value="String(rows[spec.id]?.boxedActual ?? 0)"
                @input="onNumberInput(spec.id, 'boxedActual', $event)"
              />
            </view>
            <view class="input-cell">
              <text class="input-label">盒养盘</text>
              <input
                type="number"
                class="num-input"
                :value="String(rows[spec.id]?.boxedCounted ?? 0)"
                @input="onNumberInput(spec.id, 'boxedCounted', $event)"
              />
            </view>
          </view>
        </view>
      </scroll-view>
    </view>

    <view class="action-bar">
      <button
        class="btn-draft"
        :disabled="submitting"
        @click="onSaveDraft"
      >
        保存草稿
      </button>
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
  height: 100vh;
  background: #f5f6f8;
}
.card {
  background: #ffffff;
  border-radius: 8px;
  padding: 14px 16px;
  margin: 10px 12px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}
.card:last-of-type {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.card-title {
  font-size: 15px;
  font-weight: 600;
  color: #333333;
  margin-bottom: 10px;
}
.card-subtitle {
  font-size: 12px;
  font-weight: 400;
  color: #888888;
  margin-left: 8px;
}
.card-row {
  margin-bottom: 8px;
  font-size: 14px;
  color: #333333;
}
.gps-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.label {
  font-size: 14px;
  color: #333333;
}
.btn-secondary {
  background: #ffffff;
  color: #1989fa;
  border: 1px solid #1989fa;
  border-radius: 6px;
  padding: 6px 12px;
  font-size: 13px;
}
.btn-secondary[disabled] {
  color: #9bc7f5;
  border-color: #cfe3f7;
}
.error-text {
  margin-top: 6px;
  color: #c62828;
  font-size: 12px;
}
.spec-scroll {
  flex: 1;
  min-height: 0;
  max-height: 60vh;
}
.spec-row {
  padding: 10px 0;
  border-bottom: 1px solid #f0f0f0;
}
.spec-row:last-child {
  border-bottom: none;
}
.spec-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 6px;
}
.spec-code {
  font-size: 11px;
  color: #999999;
  font-family: monospace;
}
.spec-name {
  font-size: 13px;
  color: #333333;
}
.input-grid {
  display: flex;
  gap: 6px;
}
.input-cell {
  flex: 1;
  display: flex;
  flex-direction: column;
}
.input-label {
  font-size: 10px;
  color: #888888;
  margin-bottom: 2px;
}
.num-input {
  width: 100%;
  height: 30px;
  padding: 0 4px;
  font-size: 13px;
  text-align: center;
  background: #f8f9fb;
  border: 1px solid #e6e8eb;
  border-radius: 4px;
  box-sizing: border-box;
}
.action-bar {
  display: flex;
  gap: 10px;
  padding: 12px;
  background: #ffffff;
  border-top: 1px solid #e6e8eb;
}
.btn-draft,
.btn-primary {
  flex: 1;
  height: 42px;
  border-radius: 6px;
  font-size: 15px;
  border: none;
}
.btn-draft {
  background: #ffffff;
  color: #1989fa;
  border: 1px solid #1989fa;
}
.btn-primary {
  background: #1989fa;
  color: #ffffff;
}
.btn-primary[disabled],
.btn-draft[disabled] {
  opacity: 0.6;
}
</style>
