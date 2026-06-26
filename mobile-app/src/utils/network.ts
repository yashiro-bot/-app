export function getNetworkType(): Promise<'online' | 'offline'> {
  return new Promise((resolve) => {
    uni.getNetworkType({
      success: (res) => resolve(res.networkType === 'none' ? 'offline' : 'online'),
      fail: () => resolve('offline'),
    });
  });
}

export function onNetworkChange(cb: (online: boolean) => void): void {
  uni.onNetworkStatusChange((res) => cb(res.isConnected));
}
