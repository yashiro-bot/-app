<script setup lang="ts">
import { ref } from 'vue';
import { getStsToken, getDevStsToken, type StsCredentials } from '../api/oss';

const props = defineProps<{ max?: number; modelValue: string[] }>();
const emit = defineEmits<{ 'update:modelValue': [urls: string[]] }>();

const urls = ref<string[]>(props.modelValue || []);
const uploading = ref(false);

async function uploadOne(localPath: string): Promise<string> {
  // Get STS credentials (try real first, fallback to dev)
  let creds: StsCredentials;
  try {
    creds = await getStsToken();
  } catch {
    creds = await getDevStsToken();
  }

  // Compress image first (uni.compressImage)
  const compressed = await new Promise<UniApp.CompressImageSuccessResult>((resolve, reject) => {
    uni.compressImage({
      src: localPath,
      quality: 80,
      compressedWidth: 1080,
      success: resolve,
      fail: reject,
    });
  });

  const filename = `photo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;
  const key = `${creds.uploadPrefix}${filename}`;

  // Upload to OSS via uni.uploadFile (which handles signed request)
  const ossUrl = `https://${creds.bucket}.${creds.region}.aliyuncs.com/${key}`;

  // For dev/mock credentials (bucket starts with MOCK_), skip actual upload
  if (creds.bucket.startsWith('MOCK_')) {
    // Return a placeholder URL for dev
    return `https://placehold.co/600x400?text=${encodeURIComponent(filename)}`;
  }

  // Real OSS upload — use uni.uploadFile with signed URL
  // For simplicity in v1: use the file's local path as URL (will be replaced when OSS is configured)
  // TODO: implement actual signed PUT to OSS
  await new Promise<void>((resolve, reject) => {
    uni.uploadFile({
      url: ossUrl,
      filePath: compressed.tempFilePath,
      name: 'file',
      header: {
        'Authorization': `OSS ${creds.accessKeyId}:PLACEHOLDER_SIGNATURE`,
      },
      success: () => resolve(),
      fail: (err) => reject(new Error(err.errMsg || 'upload failed')),
    });
  });

  return ossUrl;
}

async function onChoose() {
  if (props.max && urls.value.length >= props.max) {
    uni.showToast({ title: `最多 ${props.max} 张`, icon: 'none' });
    return;
  }
  const remaining = (props.max || 9) - urls.value.length;
  try {
    const choose = await new Promise<UniApp.ChooseImageSuccessCallbackResult>((resolve, reject) => {
      uni.chooseImage({
        count: remaining,
        sourceType: ['camera', 'album'],
        success: resolve,
        fail: reject,
      });
    });
    uploading.value = true;
    const newUrls: string[] = [];
    for (const path of choose.tempFilePaths) {
      const url = await uploadOne(path);
      newUrls.push(url);
    }
    urls.value = [...urls.value, ...newUrls];
    emit('update:modelValue', urls.value);
  } catch (e) {
    uni.showToast({ title: '选择/上传失败', icon: 'none' });
  } finally {
    uploading.value = false;
  }
}

function remove(i: number) {
  urls.value.splice(i, 1);
  emit('update:modelValue', [...urls.value]);
}
</script>

<template>
  <view class="photo-uploader">
    <view v-for="(url, i) in urls" :key="i" class="thumb">
      <image :src="url" mode="aspectFill" class="thumb-img" />
      <view class="remove-btn" @click="remove(i)">×</view>
    </view>
    <view v-if="!max || urls.length < max" class="add-btn" @click="onChoose">
      <text v-if="uploading">上传中...</text>
      <text v-else>+ 添加照片</text>
    </view>
  </view>
</template>

<style scoped>
.photo-uploader { display: flex; flex-wrap: wrap; gap: 8px; padding: 8px 0; }
.thumb { position: relative; width: 80px; height: 80px; border-radius: 8px; overflow: hidden; background: #eee; }
.thumb-img { width: 100%; height: 100%; }
.remove-btn { position: absolute; top: -6px; right: -6px; width: 20px; height: 20px; border-radius: 50%; background: #f56c6c; color: white; text-align: center; line-height: 20px; font-size: 16px; }
.add-btn { width: 80px; height: 80px; border: 2px dashed #ccc; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: #999; font-size: 14px; }
</style>
