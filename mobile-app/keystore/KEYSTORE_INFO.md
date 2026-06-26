# Android Keystore 管理

> 适用范围：cigar-collection 项目 Android 端签名。
> 关联文档：`docs/deploy/mobile-distribution.md` 第 3.1 节。

⚠️ **本目录中的 `.keystore` / `.jks` 文件严禁 git commit。一旦丢失，无法升级已发布的 App。**

---

## 1. 生成 keystore

### 1.1 用 keytool（推荐）

要求 JDK 17+。在 `mobile-app/keystore/` 目录下执行：

```bash
cd mobile-app/keystore

keytool -genkeypair \
  -alias cigar-collection \
  -keyalg RSA \
  -keysize 4096 \
  -validity 9125 \
  -keystore cigar-collection-release.keystore \
  -storepass "CHANGE_ME_TO_1PASSWORD" \
  -keypass "CHANGE_ME_TO_1PASSWORD" \
  -dname "CN=cigar-collection, OU=Mobile, O=ChinaTobacco, L=Hangzhou, ST=Zhejiang, C=CN"
```

参数说明：

| 参数 | 值 | 说明 |
| --- | --- | --- |
| `-alias` | `cigar-collection` | HBuilderX 打包时填的「证书别名」 |
| `-keysize` | `4096` | RSA 长度，越大越安全，1024 / 2048 也可（Google 要求 ≥ 2048） |
| `-validity` | `9125` | 有效期 25 年（365 × 25）。**keystore 本身不要过期**；签名证书过期但 keystore 不过期，App 可继续升级 |
| `-storepass` | 强密码 | keystore 入口密码，存 1Password |
| `-keypass` | 强密码 | alias 私钥密码，**默认与 storepass 相同**；如果不同，HBuilderX 要填两个密码框 |
| `-dname` | 见上 | Distinguished Name，按需修改 OU / O |

### 1.2 用 Android Studio（GUI）

1. **Build → Generate Signed Bundle / APK**
2. 选择 **APK** → Next
3. 点击 **Create new...**
4. 路径选 `mobile-app/keystore/cigar-collection-release.keystore`
5. Password 填强密码
6. Alias `cigar-collection`，Validity 25 年
7. Certificate 填公司信息
8. OK → 生成完成

---

## 2. 备份要求

keystore 丢失 = 该 App 在 Google Play / 国产商店永久死亡。**必须有 ≥ 2 个独立备份**：

| 备份位置 | 介质 | 谁有访问权 |
| --- | --- | --- |
| 1Password | 云端 | Tech Lead + DevOps |
| 阿里云 KMS | 加密 secret | DevOps |
| 离线 U 盘（推荐 2 份） | 加密 ZIP（密码 1Password 存） | Tech Lead 保险柜 + 公司机房保险柜 |

**U 盘备份脚本**（仅 DevOps 在双人复核下执行）：

```bash
# 加密压缩
zip -e cigar-collection-keystore-backup-$(date +%Y%m%d).zip \
  mobile-app/keystore/cigar-collection-release.keystore

# 验证解压
unzip -l cigar-collection-keystore-backup-*.zip

# SHA-256 留档
sha256sum cigar-collection-release.keystore
```

把 SHA-256 也存到 1Password。**任何人更换 keystore 都意味着换签名 = 用户必须卸载重装**。

---

## 3. 提交规范

### 3.1 .gitignore

确保 `mobile-app/.gitignore`（或仓库根 `.gitignore`）包含：

```gitignore
# Android keystore - 严禁提交
keystore/*.keystore
keystore/*.jks
keystore/*.p12
keystore/*.zip
keystore/*.key
!keystore/.gitkeep
!keystore/KEYSTORE_INFO.md
```

### 3.2 git hook（可选）

在 `mobile-app/.git/hooks/pre-commit` 加：

```bash
#!/bin/bash
if git diff --cached --name-only | grep -E '\.(keystore|jks|p12|key)$'; then
  echo "ERROR: 禁止提交 keystore 文件！"
  exit 1
fi
```

`chmod +x .git/hooks/pre-commit`

### 3.3 历史清理

如果已经不小心提交过 keystore，立即：

```bash
# 1. 立即轮换（生成新 keystore，更新 App 签名）
keytool -genkeypair -alias cigar-collection-new ...

# 2. 用 git-filter-repo 从所有历史中擦除
git filter-repo --path mobile-app/keystore/cigar-collection-release.keystore --invert-paths
git push origin --force --all

# 3. 通知所有协作者 reset 本地分支
```

⚠️ 即便擦除历史，**已发布 App 的签名指纹仍在 Google Play 上**，攻击者仍可伪造「同签名升级」。所以新 keystore 出包后，必须让用户卸载重装（数据丢失，但 App 内登录态是 token，可重新登录）。

---

## 4. 在 HBuilderX 使用

打开 HBuilderX → 发行 → 原生 APP-云打包 → Android → 证书：

| 表单项 | 填写内容 |
| --- | --- |
| 证书文件 | `mobile-app/keystore/cigar-collection-release.keystore` |
| 证书密码 | `-storepass` 那个（1Password 取） |
| 证书别名 | `cigar-collection` |
| 私钥密码 | 默认与证书密码相同；如果不同则填 `-keypass` 那个 |

---

## 5. 验证签名

发布前用 apksigner 验证 APK 用的是正确的 keystore：

```bash
# 提取 keystore 证书指纹
keytool -list -v -keystore cigar-collection-release.keystore | grep SHA256

# 提取 APK 签名指纹
apksigner verify --print-certs app-release.apk | grep SHA-256

# 两个 SHA-256 必须一致
```

把 keystore 的 SHA-256 记录到 1Password 的「mobile-release-keystore」条目，并附在每次发布说明的「签名指纹」段。

---

## 6. 轮换周期

| 项 | 建议 |
| --- | --- |
| keystore 本身 | 永不过期（25 年 validity 足够） |
| 签名证书（alias） | 25 年（keytool 默认最长 50 年，25 年合规且有升级缓冲） |
| 备份 U 盘 | 每年 1 月重做一次，确认可解密 |
| 1Password 条目 | 每季度核对一次访问权限 |

---

## 7. 应急联系方式

如果发现 keystore 泄露或丢失：

1. **立即**通知 Tech Lead 与 DevOps
2. 在 1Password 标记该条目为「Compromised」
3. 按本文件第 3.3 节轮换 keystore 并发布新版本
4. 用户会被强制卸载重装（数据通过后端恢复，登录态需重新登录）

---

## 附录：iOS 证书不在此目录

iOS 用 `.p12` 文件 + Apple Developer 后台的 Provisioning Profile，**不放在这个目录**。iOS 证书管理见 `docs/deploy/mobile-distribution.md` 第 4 节。

如需在本仓库跟踪 iOS 证书引用关系（不含证书本体），建议新建 `mobile-app/ios-certs/README.md`，但**不要把 .p12 / .cer / .mobileprovision 放进仓库**。