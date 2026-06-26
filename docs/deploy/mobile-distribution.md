# 移动端打包与分发 Runbook

> 适用范围：cigar-collection 项目外勤采集 App（uni-app，Vue 3 + Vite）。
> 目标平台：Android（APK）+ iOS（IPA）。
> 文档版本：v1.0，配套执行 plan 见 `/home/wewe/.omo/plans/cigar-collection.md`。
> 前置文档：`docs/deploy/alibaba-cloud.md`（OSS 桶创建依赖此文档第 4 节）。

本文是**操作 runbook**，不是 uni-app 教程。每节给出**控制台/工具路径**、**预期结果**、**注意事项**，可直接按步骤执行。所有密钥类信息（keystore 密码、Apple Developer 证书）**禁止硬编码进 git**，统一存到 1Password / 阿里云 KMS。

---

## 0. 前置准备

执行下文前需准备好以下材料，缺一不可。

| 项 | 要求 | 备注 |
| --- | --- | --- |
| **HBuilderX** | ≥ 4.0 alpha，DCloud 官方 IDE，集成 uni-app 编译器和云打包 | [https://www.dcloud.io/hbuilderx.html](https://www.dcloud.io/hbuilderx.html)，需登录 DCloud 账号 |
| **DCloud 账号** | 已实名（手机号 + 邮箱） | 用于 `__UNI__XXXXXX` appid 申请；个人账号即可打 Android 包，企业账号才能上架 App Store |
| **JDK 17+** | OpenJDK 或 Oracle JDK，**必须 JDK 17**，JDK 11 / 8 不被 uni-app 当前云打包节点支持 | `java -version` 验证；不要装 JRE |
| **Android SDK + Build-Tools** | Platform 30、Build-Tools 30.0.3（仅在「本地打包」时需要；走云打包可跳过） | 推荐使用 Android Studio 一次性安装 |
| **Gradle 7.x** | 仅「本地打包」时需要；云打包由 DCloud 节点负责 | uni-app 项目自带 `gradle-wrapper.properties` |
| **Apple Developer 账号** | 个人/公司 ¥688/年 | iOS 专用；如果只做 Android 可跳过第 4 节 |
| **macOS 机器** | macOS 12+，装 Xcode 15+ | iOS 专用；HBuilderX 在 macOS 才能打 IPA |
| **OSS Bucket** | `cigar-collection-mobile`，公共读、跨域允许 `*` | 见 `alibaba-cloud.md` 第 4 节 |
| **已备案域名** | `cigar.example.com`，CNAME 到 OSS 或 CDN | 用于第 6 节下载页 |

**风险提示**：
1. **不要把 keystore 提交到 git**。一旦丢失，无法升级已发布的 App（同一个签名才是同一个 App）。详见 `mobile-app/keystore/KEYSTORE_INFO.md`。
2. **iOS 打包必须用 macOS**。Windows / Linux 无法生成 IPA。
3. **HBuilderX 的云打包每天有免费次数限制**（约 5 次/天）。频繁出包请用本地打包或升级付费。

---

## 1. 架构概览

```
                        ┌──────────────────────────┐
                        │  DCloud 云打包节点        │
                        │  (HBuilderX → 发行 → ...) │
                        └────────┬─────────────────┘
                                 │ APK / IPA
                                 ▼
                  ┌──────────────────────────────┐
                  │ 阿里云 OSS                    │
                  │  bucket: cigar-collection-mobile │
                  │  └─ android/v1.0.0/app.apk    │
                  │  └─ android/v1.0.0/app.aab    │
                  │  └─ ios/v1.0.0/app.ipa        │
                  └────────┬─────────────────────┘
                           │ HTTPS
                ┌──────────┼─────────────┐
                ▼          ▼             ▼
         ┌──────────┐ ┌──────────┐ ┌──────────┐
         │ 客户经理  │ │ 管理员   │ │ H5 兜底  │
         │ Android  │ │ iOS      │ │ 浏览器    │
         └──────────┘ └──────────┘ └──────────┘
                  ▲
                  │ 通过 cigar.example.com/download.html 下载
                  │
              ┌───────────────────────┐
              │ 阿里云 CDN / OSS 静态  │
              │  cigar.example.com    │
              └───────────────────────┘
```

---

## 2. 配置 manifest.json

uni-app 编译时**只读 `src/manifest.json`**（不是项目根的 `mobile-app/manifest.json`）。发布前必须把根 `manifest.json` 的字段同步到 `src/manifest.json`。

### 2.1 关键字段

打开 `mobile-app/manifest.json`，确认/修改：

| 字段 | 发布值 | 说明 |
| --- | --- | --- |
| `name` | `雪茄采集` | App 显示名 |
| `appid` | `__UNI__XXXXXX` | **必须**在 HBuilderX 登录后替换；占位 `com.cigar.collection` 不可发布 |
| `versionName` | `1.0.0` | 用户可见版本号 |
| `versionCode` | `100` | Android 内部版本号（必须单调递增） |
| `app-plus.distribute.android.minSdkVersion` | `21` | Android 5.0，覆盖率 ≥ 99% |
| `app-plus.distribute.android.targetSdkVersion` | `30` | Google Play 最低要求 |
| `app-plus.distribute.android.abiFilters` | `["armeabi-v7a", "arm64-v8a"]` | 覆盖所有真机；不要加 `x86`（模拟器专属） |

### 2.2 Android 权限（已就绪）

发布配置包含 6 项权限：

- `INTERNET` + `ACCESS_NETWORK_STATE`：axios 调用后端 API
- `ACCESS_FINE_LOCATION`：GPS 采集核验（uni-app Geolocation 模块）
- `CAMERA`：现场拍照（uni-app Camera 模块）
- `READ_EXTERNAL_STORAGE` + `WRITE_EXTERNAL_STORAGE`：相册选图 + 缓存

**如果后续要加 ACCESS_COARSE_LOCATION 作为兜底 GPS**，手动在 `src/manifest.json` 同步添加（uni-app 云打包会自动注入 FINE，但部分国产 ROM 需要显式声明 COARSE）。

### 2.3 iOS 隐私声明（已就绪）

`app-plus.distribute.ios.privacyDescription` 已配置三个 key：

- `NSLocationWhenInUseUsageDescription` - 中文文案：**用于采集零售客户经理市场位置以核实实地采集**
- `NSCameraUsageDescription` - 中文文案：**用于拍摄零售客户雪茄柜台库存照片，仅作采集证据**
- `NSPhotoLibraryUsageDescription` - 中文文案：**用于从相册选择雪茄柜台照片**

**App Store 审核时会逐字读这三段文案**，必须是中文，且明确说明用途，不能写"用于改善用户体验"之类的废话。

### 2.4 同步到 src/manifest.json

```bash
# macOS / Linux
cp mobile-app/manifest.json mobile-app/src/manifest.json

# Windows (PowerShell)
Copy-Item mobile-app\manifest.json mobile-app\src\manifest.json -Force
```

⚠️ 同步完成后**必须重启 HBuilderX**，否则 IDE 缓存的旧 appid 仍会生效。

---

## 3. Android APK 打包

### 3.1 准备 keystore

如果还没有正式 keystore，先执行 `mobile-app/keystore/KEYSTORE_INFO.md` 第 1 节的生成命令。生成的 `cigar-collection-release.keystore` 必须放在 `mobile-app/keystore/` 目录（**gitignore**），密码存 1Password。

### 3.2 HBuilderX 云打包（推荐）

1. 打开 HBuilderX → 菜单栏 → **发行** → **原生 APP-云打包**
2. 选择平台：**Android**
3. 打包类型：**正式包**（debug 包签名不一致，无法覆盖安装）
4. 证书：
   - 点击「自有证书」上传 `cigar-collection-release.keystore`
   - 填写别名（alias）、密码、keystore 密码
5. 勾选：
   - ✅ **使用广告标识（OAID）** - 关闭（uni-app 内置统计）
   - ✅ **支持 CPU 架构** - 仅勾 `arm64-v8a`（APK 体积可减半，armeabi-v7a 用户 < 5% 可放弃）
   - ✅ **添加开屏广告** - 关闭
6. 点击「打包」→ 等待 3-8 分钟 → 控制台输出下载链接

### 3.3 本地打包（高级）

仅当需要 CI/CD 自动化时使用。要求：

- JDK 17 + Android SDK Platform 30 + Build-Tools 30.0.3
- 项目根有 `android/` 子目录（HBuilderX 首次云打包会自动生成）

```bash
cd mobile-app
# 1. HBuilderX 生成 android/ 子项目：发行 → 原生 APP-云打包 → 选「制作 App 资源」
#    会输出 unpackage/release/android 目录
# 2. 进入 android 子项目
cd unpackage/release/android
# 3. 配置 local.properties
echo "sdk.dir=$ANDROID_HOME" > local.properties
# 4. 打包
./gradlew assembleRelease
# 产物: app/build/outputs/apk/release/app-release.apk
```

### 3.4 验证 APK

```bash
# 安装到测试机
adb install -r app-release.apk

# 查看签名是否正确（必须显示发布证书指纹）
apksigner verify --print-certs app-release.apk | grep SHA-256
```

把 SHA-256 指纹记录到 1Password 的「mobile-release-keystore」条目。

### 3.5 版本升级

每次发布递增 `versionCode`：

| versionName | versionCode | 说明 |
| --- | --- | --- |
| 1.0.0 | 100 | 首发 |
| 1.0.1 | 101 | 紧急修复 |
| 1.1.0 | 110 | 新功能（minor 位 × 10 + patch） |

---

## 4. iOS IPA 打包

### 4.1 前置：注册 Apple Developer

1. 打开 [https://developer.apple.com/programs/enroll/](https://developer.apple.com/programs/enroll/)
2. 选择 **个人**（¥688/年）或 **公司**（¥688/年 + D-U-N-S 编号）
3. 等待 1-3 天审核，通过后获得 Team ID

### 4.2 macOS 上生成 p12 证书

仅 Team Admin / Agent 能操作：

```bash
# 1. Keychain Access → Certificate Assistant → Request a Certificate From a Certificate Authority
#    Email: 你的 apple id, Common Name: cigar-collection, Saved to disk
# 2. 上传 CSR 到 https://developer.apple.com/account/resources/certificates/list
#    → iOS App Development (debug) / iOS Distribution (release)
# 3. 下载 .cer，双击导入 Keychain
# 4. 导出为 .p12（Keychain Access → 右键证书 → Export）
```

p12 密码存 1Password。

### 4.3 HBuilderX 打 IPA

1. macOS 上打开 HBuilderX → **发行** → **原生 APP-云打包**
2. 选择平台：**iOS**
3. 打包类型：**正式包**
4. 上传 .p12 + 填写 Provisioning Profile（见 4.4）
5. 点击「打包」→ 等待 5-10 分钟 → 下载 `.ipa`

### 4.4 生成 Provisioning Profile

App Store 发布需要：

1. 登录 [https://developer.apple.com/account/resources/profiles/list](https://developer.apple.com/account/resources/profiles/list)
2. 选择 **App Store** 类型
3. 选择之前创建的 App ID（必须与 manifest.json 的 `appid` 一致，**注意 DCloud appid 与 Apple Bundle ID 不冲突**，uni-app 会自动生成 `com.cigar.collection` 风格的 Bundle ID，需要在 Apple Developer 后台注册同名 Bundle ID）

### 4.5 上传 App Store

iPA 不能直接发给用户，必须走 TestFlight 或 App Store：

```bash
# macOS, 用 Transporter 或 altool 上传
xcrun altool --upload-app --file app.ipa \
  --type ios \
  --username "your-apple-id@example.com" \
  --password "@keychain:AC_PASSWORD"
```

⚠️ **Apple 审核 1-7 天**。首次提交大概率被拒，需根据 Feedback 修改再提交。

---

## 5. 上传到阿里云 OSS

### 5.1 目录结构

```
oss://cigar-collection-mobile/
├── android/
│   ├── v1.0.0/
│   │   ├── cigar-collection-1.0.0.apk
│   │   ├── cigar-collection-1.0.0.apk.sha256
│   │   └── release-notes.md
│   └── latest → v1.0.0/  (符号链接，CDN 走这个)
├── ios/
│   ├── v1.0.0/
│   │   ├── cigar-collection-1.0.0.ipa
│   │   └── release-notes.md
│   └── latest → v1.0.0/
└── index.html (指向 latest 的下载页)
```

### 5.2 上传命令

```bash
# 1. 计算 SHA-256 校验和
sha256sum cigar-collection-1.0.0.apk | tee cigar-collection-1.0.0.apk.sha256

# 2. 用 ossutil 上传（先到阿里云控制台下载 ossutil64）
ossutil64 cp cigar-collection-1.0.0.apk \
  oss://cigar-collection-mobile/android/v1.0.0/cigar-collection-1.0.0.apk \
  --update

ossutil64 cp cigar-collection-1.0.0.apk.sha256 \
  oss://cigar-collection-mobile/android/v1.0.0/

# 3. 更新 latest 软链
ossutil64 cp cigar-collection-1.0.0.apk \
  oss://cigar-collection-mobile/android/latest/cigar-collection-latest.apk \
  --update --force
```

### 5.3 配置公共读 + 缓存

OSS 控制台 → `cigar-collection-mobile` → 文件管理 → `android/latest/` → 设置 HTTP 头：

```
Cache-Control: public, max-age=3600
Content-Type: application/vnd.android.package-archive
Content-Disposition: attachment; filename="cigar-collection.apk"
```

`Content-Disposition: attachment` 让浏览器直接弹出下载，而不是在线打开 APK（部分浏览器会尝试反编译 APK 显示乱码）。

### 5.4 CDN 加速（可选）

如果用户分布广（中国烟草的零售经理可能跨省），加 CDN：

1. 阿里云 CDN → 添加域名 `cdn-cigar.example.com`
2. 回源 OSS bucket `cigar-collection-mobile`
3. 缓存策略：APK / IPA 设置 `1 天`，HTML 设置 `5 分钟`
4. HTTPS 证书用阿里云免费证书

---

## 6. 创建下载页

下载页代码见 **`docs/deploy/download.html`**（独立 HTML，单文件，无构建）。

部署方式（任选其一）：

### 方案 A：OSS 静态托管

```bash
ossutil64 cp docs/deploy/download.html \
  oss://cigar-collection-mobile/download.html \
  --update

# OSS 控制台 → 域名管理 → 绑定 cigar.example.com → CNAME 到 OSS
```

### 方案 B：与 admin 同 Nginx 部署

把 `download.html` 拷贝到 admin 的 `dist/` 目录一起构建，nginx 加一个 location：

```nginx
location = /download.html {
    alias /var/www/admin/dist/download.html;
}

location /downloads/ {
    # 转发到 OSS（避免大文件走 ECS 流量）
    proxy_pass https://cigar-collection-mobile.oss-cn-hangzhou.aliyuncs.com/downloads/;
    proxy_set_header Host cigar-collection-mobile.oss-cn-hangzhou.aliyuncs.com;
}
```

访问 `https://cigar.example.com/download.html` 即可。

---

## 7. 用户安装指引

把以下内容**附在 App 的欢迎页**（首次启动 modal）或下载页底部：

### Android 安装步骤

1. 在手机浏览器打开 `https://cigar.example.com/download.html`
2. 点击「Android 下载」按钮 → 浏览器下载 `cigar-collection.apk`
3. 下载完成后从通知栏点击 APK → 系统提示「禁止安装来自此来源的应用」
4. 进入 **设置 → 应用 → 特殊应用权限 → 安装未知应用** → 授权浏览器
5. 回到下载页重新点击 APK → 完成安装
6. 首次启动 App 授予「位置」「相机」「存储」权限

### iOS 安装（TestFlight 灰度）

1. App Store 搜索「TestFlight」并安装
2. 收到邀请邮件 → 点击「View in TestFlight」
3. TestFlight 内点击「Install」→ App 图标出现在桌面

### 常见用户问题

| 问题 | 答案 |
| --- | --- |
| 安装时提示「解析包出现问题」 | 让用户重新下载，多半是下载中断导致 APK 不完整 |
| 启动后白屏 | 检查后端 API 地址，App 内「我的 → 关于」可看当前 API |
| GPS 一直拿不到 | 检查是否授予「位置」权限，并打开手机 GPS 开关 |
| iOS TestFlight 邀请邮件没收到 | 检查垃圾邮件；超过 90 天邀请失效，需重新生成 |

---

## 8. 故障排查

### 8.1 HBuilderX 云打包失败

| 错误 | 原因 | 解决 |
| --- | --- | --- |
| `appid 不存在或未登录` | DCloud 账号未登录 | HBuilderX → 登录 → 用注册 DCloud 的邮箱 |
| `manifest.json 解析失败` | JSON 语法错（多了逗号、引号） | `python3 -c "import json; json.load(open('src/manifest.json'))"` 验证 |
| `keystore 别名错误` | 输错了 alias | 用 `keytool -list -keystore xxx.keystore` 查 |
| `证书密码错误` | keystore 密码和 alias 密码是两个 | 分别在 HBuilderX 填写两个输入框 |
| `gradle 编译超时` | 网络问题，下载依赖慢 | 重试，或切本地打包 |

### 8.2 APK 安装失败

| 错误 | 原因 | 解决 |
| --- | --- | --- |
| `INSTALL_FAILED_UPDATE_INCOMPATIBLE` | 旧版签名不同 | `adb uninstall com.cigar.collection` 后重装 |
| `INSTALL_PARSE_FAILED_NO_CERTIFICATES` | APK 未签名 | 检查 keystore 是否上传 |
| `INSTALL_FAILED_OLDER_SDK` | 设备 Android < 5.0 | `minSdkVersion: 21` 已覆盖，无需调整 |
| `INSTALL_FAILED_INSUFFICIENT_STORAGE` | 手机空间不足 | 清理后重试 |

### 8.3 iOS 上传失败

| 错误 | 原因 | 解决 |
| --- | --- | --- |
| `ITMS-90034` | Bundle ID 与证书不匹配 | 检查 Apple Developer 后台 Bundle ID 与 manifest.json `appid` 一致 |
| `ITMS-90161` | Provisioning Profile 过期 | 重新生成（每年到期前 30 天提醒） |
| `ITMS-90809` | 使用了 deprecated API | Xcode 升级到 15+ 后重新打包 |

### 8.4 下载链接失效

症状：用户报「链接打不开 / 下载 404」。

1. 检查 OSS 文件是否存在：`ossutil64 ls oss://cigar-collection-mobile/android/latest/`
2. 检查 OSS 桶公共读权限是否被关闭：控制台 → 权限管理 → 读写权限 → 公共读
3. 检查 CDN 缓存：刷新 URL（CDN 控制台 → 刷新预热 → URL 刷新）
4. 检查域名备案：未备案域名 CDN 会自动封停

---

## 9. 安全检查清单

每次发版前过一遍：

- [ ] keystore 密码未硬编码进 git（`git log --all -p | grep -i keystore` 应无结果）
- [ ] `mobile-app/keystore/` 在 `.gitignore` 中
- [ ] manifest.json 的 `appid` 已是真实的 `__UNI__XXXXXX`
- [ ] iOS 隐私声明文案是中文且明确
- [ ] `uniStatistics.enable: false`（关闭 DCloud 统计，不外传用户数据）
- [ ] APK SHA-256 校验和已上传 OSS
- [ ] 后端 API 地址走 HTTPS（manifest.json 或代码中）

---

## 10. 后续 TODO

- [ ] CI 自动化：用 GitHub Actions 在 tag 触发时自动出 APK（参考 `mobile-app/package.json` 的 `build:app-android`）
- [ ] 崩溃上报：集成 Sentry uni-app SDK（[https://sentry.io/for/uni-app/](https://sentry.io/for/uni-app/)）
- [ ] App Store 上架准备：截图（6.5"/5.5" 各 3 张）、隐私政策 URL、应用描述
- [ ] 国内安卓市场分发：华为、小米、OPPO、vivo、腾讯（每家都要软著 + ICP + 实名）