<script setup lang="ts">
import type { CollectionSpecDetail } from '../api/collections';

defineProps<{
  /** Detail rows (already sorted by cigarSpecId on the backend). */
  details: CollectionSpecDetail[];
}>();
</script>

<template>
  <scroll-view scroll-y class="spec-scroll">
    <view v-if="details.length === 0" class="specs-empty">
      无规格明细
    </view>
    <view v-else class="spec-table">
      <view class="spec-table-head">
        <text class="cell cell--name">规格</text>
        <text class="cell cell--num">销售</text>
        <text class="cell cell--num">裸养实</text>
        <text class="cell cell--num">裸养盘</text>
        <text class="cell cell--num">盒养实</text>
        <text class="cell cell--num">盒养盘</text>
      </view>
      <view
        v-for="d in details"
        :key="d.id"
        class="spec-table-row"
      >
        <view class="cell cell--name">
          <text class="spec-name">{{ d.cigarSpec.name }}</text>
          <text class="spec-code">{{ d.cigarSpec.code }}</text>
        </view>
        <text class="cell cell--num">{{ d.salesQty }}</text>
        <text class="cell cell--num">{{ d.actualStockLoose }}</text>
        <text class="cell cell--num">{{ d.countedStockLoose }}</text>
        <text class="cell cell--num">{{ d.actualStockBoxed }}</text>
        <text class="cell cell--num">{{ d.countedStockBoxed }}</text>
      </view>
    </view>
  </scroll-view>
</template>

<style scoped>
.spec-scroll {
  flex: 1;
  min-height: 0;
  max-height: 65vh;
}
.specs-empty {
  padding: 48rpx;
  text-align: center;
  color: #8a8a8a;
  font-size: 26rpx;
}
.spec-table {
  display: flex;
  flex-direction: column;
}
.spec-table-head,
.spec-table-row {
  display: flex;
  align-items: center;
  padding: 12rpx 8rpx;
  border-bottom: 1rpx solid #f0f0f0;
}
.spec-table-head {
  font-size: 22rpx;
  color: #8a8a8a;
  font-weight: 500;
  background-color: #fafbfc;
  position: sticky;
  top: 0;
  z-index: 1;
}
.spec-table-row {
  font-size: 26rpx;
  color: #303133;
}
.cell {
  padding: 0 6rpx;
  box-sizing: border-box;
}
.cell--name {
  flex: 0 0 220rpx;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.cell--num {
  flex: 1;
  text-align: center;
  font-variant-numeric: tabular-nums;
}
.spec-name {
  font-size: 26rpx;
  color: #303133;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.spec-code {
  font-size: 20rpx;
  color: #8a8a8a;
  font-family: monospace;
}
</style>