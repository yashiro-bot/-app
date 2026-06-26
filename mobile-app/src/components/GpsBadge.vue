<script setup lang="ts">
import { computed } from 'vue';
import { accuracyLevel, formatAccuracy } from '../utils/location';

/**
 * Visual GPS-accuracy indicator.
 *
 * Props:
 *   - `accuracy`: fix accuracy in meters, or `null` when no fix is held yet
 *   - `loading`: when true the badge shows "定位中..." and ignores accuracy
 *
 * Color buckets (matches `accuracyLevel` in `utils/location.ts`):
 *   - good   (< 30 m)   → green
 *   - medium (< 100 m)  → orange
 *   - poor   (≥ 100 m)  → red (also used when accuracy is null / unknown)
 */
const props = defineProps<{ accuracy: number | null; loading?: boolean }>();

const level = computed(() =>
  props.accuracy == null ? 'poor' : accuracyLevel(props.accuracy),
);

const text = computed(() => {
  if (props.loading) return '定位中...';
  if (props.accuracy == null) return '未定位';
  return formatAccuracy(props.accuracy);
});

const colorClass = computed(
  () =>
    ({
      good: 'badge-good',
      medium: 'badge-medium',
      poor: 'badge-poor',
    })[level.value],
);
</script>

<template>
  <view class="gps-badge" :class="colorClass">{{ text }}</view>
</template>

<style scoped>
.gps-badge {
  display: inline-block;
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
  line-height: 1.4;
  white-space: nowrap;
}
.badge-good {
  background: #e8f5e9;
  color: #2e7d32;
}
.badge-medium {
  background: #fff3e0;
  color: #ef6c00;
}
.badge-poor {
  background: #ffebee;
  color: #c62828;
}
</style>