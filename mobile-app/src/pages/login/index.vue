<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { storage } from '@/utils/storage';

const username = ref('');
const password = ref('');
const loading = ref(false);
const showWelcomeBack = ref(false);
const cachedName = ref('');

const authStore = useAuthStore();

const canSubmit = computed(
  () => !loading.value && username.value.trim().length > 0 && password.value.length > 0,
);

onMounted(() => {
  // If already logged in with a valid token, go straight to main page
  if (authStore.isLoggedIn) {
    uni.switchTab({ url: '/pages/customers/index' });
    return;
  }
  // If we have cached user info (e.g. after token expiry), show welcome back
  const savedUser = storage.get<{ name: string; username: string }>('user');
  const savedToken = storage.get<string>('token');
  if (savedUser && savedUser.name) {
    cachedName.value = savedUser.name;
    username.value = savedUser.username || '';
    showWelcomeBack.value = true;
  }
});

async function onSubmit(): Promise<void> {
  if (!canSubmit.value) return;
  loading.value = true;
  try {
    await authStore.login(username.value.trim(), password.value);
    uni.switchTab({ url: '/pages/customers/index' });
  } catch (err) {
    const status = (err as { response?: { status?: number } })?.response?.status;
    if (status === 401) {
      uni.showToast({ title: '账号或密码错误', icon: 'none' });
    } else {
      uni.showToast({ title: '网络异常，请稍后重试', icon: 'none' });
    }
  } finally {
    loading.value = false;
  }
}

async function onWelcomeBack(): Promise<void> {
  const savedToken = storage.get<string>('token');
  if (!savedToken) {
    showWelcomeBack.value = false;
    return;
  }
  loading.value = true;
  try {
    const { http } = await import('@/utils/request');
    await http.get('/auth/me');
    uni.switchTab({ url: '/pages/customers/index' });
  } catch {
    showWelcomeBack.value = false;
  } finally {
    loading.value = false;
  }
}

function onSwitchAccount(): void {
  storage.remove('token');
  storage.remove('user');
  showWelcomeBack.value = false;
  username.value = '';
  password.value = '';
}
</script>

<template>
  <view class="login-page">
    <view class="card">
      <view class="title">雪茄采集</view>

      <!-- Welcome Back mode -->
      <template v-if="showWelcomeBack && cachedName">
        <view class="welcome-section">
          <view class="avatar">{{ cachedName.charAt(0) }}</view>
          <view class="welcome-title">欢迎回来</view>
          <view class="welcome-name">{{ cachedName }}</view>
          <button
            class="welcome-btn"
            :loading="loading"
            :disabled="loading"
            @click="onWelcomeBack"
          >
            {{ loading ? '验证中...' : '点击进入' }}
          </button>
          <view class="switch-account" @click="onSwitchAccount">
            切换账号
          </view>
        </view>
      </template>

      <!-- Full login mode -->
      <template v-else>
        <view class="subtitle">请登录</view>

        <view class="field">
          <input
            v-model="username"
            class="input"
            type="text"
            placeholder="账号"
            placeholder-class="placeholder"
            :disabled="loading"
            :maxlength="64"
            confirm-type="next"
          />
        </view>

        <view class="field">
          <input
            v-model="password"
            class="input"
            type="password"
            password
            placeholder="密码"
            placeholder-class="placeholder"
            :disabled="loading"
            :maxlength="128"
            confirm-type="done"
            @confirm="onSubmit"
          />
        </view>

        <button
          class="submit"
          :class="{ 'submit--disabled': !canSubmit }"
          :disabled="!canSubmit"
          :loading="loading"
          @click="onSubmit"
        >
          {{ loading ? '登录中...' : '登录' }}
        </button>
      </template>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.login-page {
  min-height: 100vh;
  background-color: #f5f6fa;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32rpx;
  box-sizing: border-box;
}

.card {
  width: 100%;
  max-width: 640rpx;
  background-color: #ffffff;
  border-radius: 16rpx;
  padding: 64rpx 48rpx;
  box-shadow: 0 8rpx 24rpx rgba(0, 0, 0, 0.06);
  box-sizing: border-box;
}

.title {
  font-size: 40rpx;
  font-weight: 600;
  color: #1a1a1a;
  text-align: center;
  margin-bottom: 8rpx;
}

.subtitle {
  font-size: 28rpx;
  color: #8a8a8a;
  text-align: center;
  margin-bottom: 48rpx;
}

// ── Welcome Back ────────────────────────────────────────

.welcome-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 24rpx 0;
}

.avatar {
  width: 120rpx;
  height: 120rpx;
  border-radius: 60rpx;
  background: linear-gradient(135deg, #1989fa, #07c160);
  color: #ffffff;
  font-size: 52rpx;
  font-weight: 600;
  text-align: center;
  line-height: 120rpx;
  margin-bottom: 24rpx;
}

.welcome-title {
  font-size: 32rpx;
  color: #1a1a1a;
  font-weight: 500;
  margin-bottom: 8rpx;
}

.welcome-name {
  font-size: 28rpx;
  color: #606266;
  margin-bottom: 40rpx;
}

.welcome-btn {
  width: 100%;
  height: 88rpx;
  line-height: 88rpx;
  background: linear-gradient(135deg, #1989fa, #07c160);
  color: #ffffff;
  font-size: 32rpx;
  border-radius: 44rpx;
  border: none;
  margin-bottom: 24rpx;

  &::after {
    border: none;
  }
}

.switch-account {
  font-size: 26rpx;
  color: #8a8a8a;
  text-decoration: underline;
}

// ── Full Login ─────────────────────────────────────────

.field {
  margin-bottom: 24rpx;
}

.input {
  width: 100%;
  height: 88rpx;
  padding: 0 24rpx;
  background-color: #f5f6fa;
  border-radius: 8rpx;
  font-size: 30rpx;
  color: #1a1a1a;
  box-sizing: border-box;
}

.placeholder {
  color: #b5b5b5;
}

.submit {
  margin-top: 16rpx;
  width: 100%;
  height: 88rpx;
  line-height: 88rpx;
  background-color: #1989fa;
  color: #ffffff;
  font-size: 32rpx;
  border-radius: 8rpx;
  border: none;

  &::after {
    border: none;
  }

  &--disabled {
    background-color: #c8e0fb;
    color: #ffffff;
  }
}
</style>
