# 阿里云基础设施初始化 Runbook

> 适用范围：cigar-collection 项目（雪茄门店客户采集与管理系统）。
> 目标规模：单租户、< 20 个客户经理、< 200 个客户、月成本 < ¥200。
> 文档版本：v1.0，配套执行 plan 见 `/home/wewe/.omo/plans/cigar-collection.md`。
> 配套环境变量：见 `backend/README.md`（`backend/.env` 占位符清单）。

本文是**操作 runbook**，不是教程。读者是已经熟悉阿里云控制台的中国烟草 IT 运维人员。每节给出**控制台路径**、**预期结果**、**注意事项**，可直接按步骤执行。所有密钥类信息**禁止硬编码**，统一用 `${VAR}` 占位符写入 `.env`（权限 600）。

---

## 0. 前置准备

执行下文前需准备好以下材料，缺一不可。

| 项 | 要求 | 备注 |
| --- | --- | --- |
| 已备案域名 | `.com` / `.cn` 均可，必须在工信部完成 ICP 备案 | 新备案 7-20 个工作日，是整个项目最大风险点 |
| 企业支付宝或营业执照实名 | 个人实名无法开企业发票、不能签云服务合同 | 营业执照 + 法人身份证正反面 |
| 企业营业执照 | 彩色扫描件 JPG/PNG，< 4MB | 用于 ICP 备案和阿里云企业认证 |
| 法人身份证 | 正反面彩色扫描件 | ICP 备案初审材料 |
| 备案负责人手机号 | 能收短信，需与法人或网站负责人一致 | 部分省份要求负责人到场核验 |
| 阿里云账号 | 已通过企业实名，建议用主账号（RAM 子账号在第 6 节创建） | 账号 ID 形如 `12xxx`，记下备用 |
| 邮箱 | 用于接收证书、备案进度、阿里云通知 | 建议企业邮箱 |

**风险提示**：ICP 备案是整条链路的**关键路径**。若使用未备案域名直接指向 ECS 公网 IP，阿里云会在 24 小时内封停 80 / 443 端口。**强烈建议在购买 ECS 之前先完成域名注册并提交备案申请**，备案通过后再开通对外服务。

---

## 1. 架构概览

```
                              [互联网]
                                 │
                ┌────────────────┼────────────────┐
                │ HTTPS 443      │ HTTPS 443       │ HTTPS 直传
                ▼                ▼                 ▼
   ┌────────────────────┐  ┌──────────────┐  ┌────────────────┐
   │ 浏览器 (管理员)    │  │ Android APP  │  │ H5 兜底 (uni)  │
   │ Vue3 SPA           │  │ uni-app 原生  │  │                │
   └────────┬───────────┘  └──────┬───────┘  └────────┬───────┘
            │ /api/*              │ /api/*           │ /api/*
            └────────────┬────────┴──────────┬───────┘
                         ▼                   ▼
                ┌─────────────────────────────────────┐
                │  阿里云 ECS (2C4G Ubuntu 22.04)     │
                │  Nginx (80/443) → Docker :3000      │
                └──┬──────────────────────────────┬───┘
                   │ 内网 3306                    │ STS 凭证
                   ▼                              ▼
        ┌──────────────────────┐         ┌─────────────────────┐
        │ 阿里云 RDS MySQL 8.0 │         │ 阿里云 OSS Bucket   │
        │ cigardb (内网访问)   │         │ cigar-photos (私有) │
        └──────────────────────┘         └─────────────────────┘
```

**关键设计**：

- ECS ↔ RDS 走**内网**，RDS 不开公网入口。
- 移动端拍照片**不经过后端**。前端先 `POST /oss/sts-token` 拿到 1 小时有效的 STS 临时凭证，再 `PUT` 到 OSS，后端只接收最终 URL。
- 管理后台与 ECS 之间走 Nginx 反向代理，Nginx 终结 TLS。

---

## 2. ECS（云服务器）

购买一台 2 核 4GB 内存、40GB 系统盘的 ECS，用来跑后端 Docker 容器和 Nginx。

### 控制台路径

1. 打开 [ECS 控制台](https://ecs.console.aliyun.com/) → 左侧 **实例与镜像 → 实例** → 右上 **创建实例**。
2. **基础配置**：
   - 计费方式：按量付费（小规模测试更灵活；生产可改包年包月 `ecs.t6-c1m2.large` ≈ ¥80/月）。
   - 地域：**华东 1（杭州）** 或 **华北 2（北京）**（与后续 RDS / OSS 同 region，便于内网互通）。
   - 实例规格：`ecs.t6-c1m2.large`（2 vCPU / 4 GiB）或 `ecs.s6-c1m2.large`（性能更稳，¥0.12/小时）。
   - 镜像：**Ubuntu 22.04 LTS 64 位**（aliyun 官方基础镜像）。
   - 系统盘：**ESSD PL1 40GB**。
3. **网络与安全组**：
   - 专有网络：新建 VPC `cigar-vpc`，交换机 `cigar-vsw-1`（CIDR `172.16.0.0/24`）。
   - 公网 IP：分配（按使用流量计费，1Mbps 起）。
   - 安全组：新建 `cigar-sg`，放行 `22/22`（仅办公室 IP）、`80/80`、`443/443`、**`3000/3000`（临时，部署后用 Nginx 反代可关闭）**。
4. **登录凭证**：自定义密码，**长度 ≥ 10 位，含大小写 + 数字 + 符号**，存到团队密码管理器。**不要**用 SSH 密钥对（运维方便起见先开密码，后续可切密钥）。

### 预期结果

- 控制台 **实例列表** 显示状态 **运行中**。
- 复制 **公网 IP**（形如 `47.xx.xx.xx`）。
- 本地 `ssh root@47.xx.xx.xx` 能登录，`uname -a` 输出 `Ubuntu 22.04`。

### 注意事项

- **安全组最小开放原则**：调试期开 `3000`，Nginx 配好后**立即在安全组里删掉** `3000` 规则。
- **不要勾选 "分配 IPv6"**，本期用 IPv4 即可。
- 系统盘 40GB 足够（Docker 镜像 + node_modules + 日志约 15GB），不够后期可在线扩容。
- 每月账单从 ECS 创建时刻开始计费，**用完即关**避免闲置扣费。

### 在 ECS 上初始化 Docker

```bash
# SSH 登录后
apt update && apt upgrade -y
apt install -y docker.io docker-compose-v2
systemctl enable --now docker
docker --version   # 期望 24+
```

预期结果：`docker --version` 输出正常版本号，`docker run hello-world` 拉取并打印欢迎信息。

---

## 3. RDS MySQL 8.0

购买一台 1 核 2GB 的 RDS，用来存业务数据。**RDS 必须与 ECS 在同一 region 和同一 VPC**，否则无法走内网。

### 控制台路径

1. 打开 [RDS 控制台](https://rds.console.aliyun.com/) → 右上 **创建实例**。
2. **基础配置**：
   - 计费方式：按量付费。
   - 地域：**与 ECS 完全一致**（如 `华东 1 杭州`）。
   - 数据库类型：MySQL，版本 **8.0**（不要选 8.4，部分驱动兼容性差）。
   - 系列：基础版。
   - 实例规格：`mysql.n2.medium.1c2g`（1 vCPU / 2 GiB）。
   - 存储：**SSD 云盘 50GB**。
3. **网络与安全**：
   - 专有网络：选择第 2 节创建的 `cigar-vpc` 和 `cigar-vsw-1`。
   - **不勾选** "申请外网地址"（RDS 不暴露公网，仅内网访问）。
4. **设置白名单**：在 RDS 实例详情 → **数据安全 → 白名单** → 添加 `172.16.0.0/24`（ECS 所在交换机网段）。
5. **创建账号**（在实例详情 → 账号管理）：
   - 账号类型：高权限账号。
   - 数据库账号：`cigar_app`（占位，实际由 `${RDS_USER}` 注入）。
   - 密码：自动生成，**复制后立刻存到团队密码管理器**，写入 `backend/.env` 的 `${RDS_PASSWORD}`。
6. **创建数据库**（在实例详情 → 数据库管理 → 创建数据库）：
   - 数据库名：`cigardb`
   - 字符集：`utf8mb4`
   - 排序规则：`utf8mb4_unicode_ci`
   - 账号授权：勾选 `cigar_app` 拥有全部权限。

### 预期结果

- RDS 实例列表显示 **运行中**。
- 在 ECS 上 `apt install -y default-mysql-client` → `mysql -h cigardb.mysql.rds.aliyuncs.com -u cigar_app -p` 能连入。
- `SHOW DATABASES;` 能看到 `cigardb`。

### 创建数据库与用户的 DDL（首次初始化）

> 在 ECS 上通过 `mysql` 客户端登录 RDS 后执行。如果控制台已经创建了 `cigardb` 和 `cigar_app`，**跳过此节**。

```sql
CREATE DATABASE IF NOT EXISTS cigardb
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'cigar_app'@'%' IDENTIFIED BY '${RDS_PASSWORD}';
GRANT ALL PRIVILEGES ON cigardb.* TO 'cigar_app'@'%';
FLUSH PRIVILEGES;
```

### 注意事项

- **RDS 必须在与 ECS 相同的 region 和 VPC**，否则走 NAT 或公网，延迟和成本都翻倍。
- **不要开外网**，白名单只放 ECS 交换机网段。
- 高权限账号密码丢失需在控制台重置（实例重启约 30 秒）。
- 备份保留默认 7 天够用，**不要**改 30 天（多收存储费）。

---

## 4. OSS Bucket

创建一个名为 `cigar-photos` 的私有 Bucket，用来存客户经理拍的雪茄柜台照片和 APK 分发包。

### 控制台路径

1. 打开 [OSS 控制台](https://oss.console.aliyun.com/) → 左侧 **Bucket 列表** → 右上 **创建 Bucket**。
2. **配置项**：
   - Bucket 名称：`cigar-photos`（全局唯一，若占用加随机后缀）。
   - 地域：**与 ECS 一致**。
   - 存储类型：**标准存储**。
   - 读写权限：**私有**（重要，避免被搜索引擎抓到客户照片）。
   - 版本控制：不开启（小项目无此需求）。
   - 服务端加密：不开启（OSS 内部已物理加密，公开访问被禁止即可）。
   - 定时删除：60 天（节省存储，自动清理 2 个月前的过期照片）。
3. 创建后进入 Bucket → **数据安全 → 跨域设置 CORS → 创建规则**，粘贴下文 JSON。

### OSS CORS 配置（浏览器 / APP 直传必须）

```json
[
  {
    "allowedOrigin": ["https://cigar.example.com", "app://uniapp"],
    "allowedMethod": ["PUT", "POST", "GET", "HEAD"],
    "allowedHeader": ["*"],
    "exposeHeader": ["ETag", "x-oss-request-id"],
    "maxAgeSeconds": 3600
  }
]
```

`allowedOrigin` 第一个值改成实际管理后台域名；`app://uniapp` 是 uni-app 在 Android/iOS 内的 WebView 来源（固定字符串）。

### 预期结果

- Bucket 列表显示 `cigar-photos`，地域正确，权限显示 **私有**。
- 用 OSS 客户端或 `ossutil` 试着 `ossutil cp ./test.jpg oss://cigar-photos/test/test.jpg`（在 ECS 上，先 `apt install -y ossutil`），能成功上传且签名 URL 能下载。

### 注意事项

- **Bucket 必须私有**，公网直读会泄露客户隐私照片。
- **路径规划**：`photos/{user_id}/{yyyy-mm-dd}/{uuid}.jpg` 存采集照片，`apk/cigar-{version}.apk` 存 APK。
- 定时删除 60 天（成本控制），可按需调整。

---

## 5. 域名 + ICP 备案 + DNS 解析

把域名指向 ECS 公网 IP，让用户能通过 `https://cigar.example.com` 访问管理后台。

### 5.1 控制台路径 - 域名注册

打开 [阿里云域名注册](https://wanwang.aliyun.com/domain/) → 搜索（如 `cigar.example.com`）→ 选 `.com` / `.cn` 后缀（`.cn` 便宜但备案更严）→ 结算时勾选 **开启隐私保护**。首年 ¥55-70。

### 5.2 ICP 备案

打开 [阿里云备案](https://beian.aliyun.com/) → **开始备案**。流程：填主办者信息（营业执照）→ 填网站信息（域名 + 服务器 IP）→ 上传资料 → 阿里云初审 1-2 工作日 → 管局审核 7-20 工作日。材料：营业执照副本、法人身份证正反面、负责人核验照、域名证书。

### 5.3 DNS 解析

打开 [云解析 DNS 控制台](https://dns.console.aliyun.com/) → 域名列表 → 选择已备案域名 → **解析设置** → 添加记录。

- **A 记录** `@` → ECS 公网 IP（`47.xx.xx.xx`），TTL 10 分钟
- **A 记录** `www`（可选）→ 同样 ECS 公网 IP
- DNS 全球生效 5-30 分钟

### 预期结果

- 备案状态在备案系统显示 **备案成功**，并获得备案号（如 `京ICP备2026xxxxxx号`）。
- 本地 `nslookup cigar.example.com` 返回 ECS 公网 IP。
- 浏览器访问 `http://cigar.example.com`（备案通过后才能正常访问 80 端口）显示 Nginx 默认页或登录页。

### 注意事项

- **备案期间域名不能解析到阿里云大陆地区 ECS**，否则会被阿里云检测到并封停。要么先解析到非大陆地区主机（如香港 ECS），要么等备案通过再绑定。
- **备案号必须放在网站底部**，示例：`<a href="https://beian.miit.gov.cn/">京ICP备2026xxxxxx号</a>`，不挂会被网信办处罚。
- 个人备案的网站不能做商业用途，企业备案才能跑雪茄销售系统（属于商业）。

---

## 6. SSL 证书 + Nginx HTTPS

为域名申请免费 SSL 证书，配置 Nginx 终结 TLS，处理浏览器 / 移动端 / APP 的 HTTPS 请求。

### 6.1 控制台路径 - 申请证书（二选一）

**方案 A：阿里云免费证书**（推荐）：[SSL 证书控制台](https://yundun.console.aliyun.com/) → 免费证书 → 立即购买（0 元）→ 创建 → 填 `cigar.example.com`，DNS 验证 → 添加阿里云指定的 CNAME 校验记录 → 等待 5-10 分钟自动签发 → 下载 Nginx 格式。

**方案 B：Let's Encrypt**（自动续期）：

```bash
# 在 ECS 上
apt install -y certbot
certbot certonly --standalone -d cigar.example.com --email admin@example.com
# 证书路径：/etc/letsencrypt/live/cigar.example.com/fullchain.pem
#           /etc/letsencrypt/live/cigar.example.com/privkey.pem
```

### 6.2 Nginx HTTPS 配置

把证书文件传到 ECS `/etc/nginx/certs/`，然后替换 `/etc/nginx/sites-available/cigar.conf`：

```nginx
# /etc/nginx/sites-available/cigar.conf
# 强制 HTTP → HTTPS 301
server {
    listen 80;
    server_name cigar.example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name cigar.example.com;

    # 证书路径
    ssl_certificate     /etc/nginx/certs/fullchain.pem;
    ssl_certificate_key /etc/nginx/certs/privkey.pem;

    # TLS 1.2+ 强制
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers 'ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305';
    ssl_prefer_server_ciphers on;

    # OCSP stapling
    ssl_stapling on;
    ssl_stapling_verify on;
    resolver 223.5.5.5 8.8.8.8 valid=300s;
    resolver_timeout 5s;

    # HSTS
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;

    # 客户端上传照片，最大 20MB
    client_max_body_size 20m;

    # 静态管理后台
    root /var/www/admin/dist;
    index index.html;

    # API 反代到后端
    location /api/ {
        proxy_pass http://127.0.0.1:3000/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
    }

    # SPA fallback
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

启用并重载：

```bash
ln -sf /etc/nginx/sites-available/cigar.conf /etc/nginx/sites-enabled/
nginx -t
systemctl reload nginx
```

### 预期结果

- `https://cigar.example.com` 浏览器显示安全锁。
- `http://cigar.example.com` 自动 301 跳转到 HTTPS。
- `https://cigar.example.com/api/health` 返回后端 `{"status":"ok"}`。
- DevTools → Security 面板显示 `TLS 1.3` 和 `HSTS` 已生效。

### 注意事项

- **不要用自签名证书**。
- TLS 1.0 / 1.1 已废弃，**只开 1.2 / 1.3**。
- 阿里云免费证书有效期 1 年，**提前 30 天续签**。
- Let's Encrypt 证书 90 天有效期，`certbot renew --quiet` 加 cron 每月 1 号。

---

## 7. RAM 子账号 AccessKey

为后端创建专用的 RAM 子账号和 AccessKey，仅授权访问 `cigar-photos` Bucket 的读写，**不要用主账号 AccessKey**。

### 控制台路径

1. 打开 [RAM 控制台](https://ram.console.aliyun.com/) → **身份管理 → 用户** → **创建用户**。
2. 填写登录名称 `cigar-app-svc`、显示名 `cigar 应用服务账号`。
3. **访问方式**：勾选 **OpenAPI 调用访问**（**不勾选**控制台登录）。
4. 创建成功后，**立即保存** AccessKey ID 和 Secret（关闭后无法再查 Secret）。
5. 给用户加权限：**权限管理 → 添加权限 → 自定义策略**，粘贴下文 JSON。

### 自定义 RAM 策略

```json
{
  "Version": "1",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "oss:PutObject",
        "oss:GetObject",
        "oss:DeleteObject",
        "oss:ListObjects"
      ],
      "Resource": [
        "acs:oss:*:*:cigar-photos",
        "acs:oss:*:*:cigar-photos/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": "sts:AssumeRole",
      "Resource": "acs:ram::*:role/cigar-sts-role"
    }
  ]
}
```

### STS 角色（移动端直传需要）

1. RAM 控制台 → **角色管理 → 创建角色** → 受信实体类型选 **阿里云账号**。
2. 角色名 `cigar-sts-role`，附加策略 `AliyunOSSFullAccess`（或自定义更严的 policy）。
3. 修改信任策略（**重要**），让 RAM 子账号 `cigar-app-svc` 能 assume：

```json
{
  "Version": "1",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "RAM": ["acs:ram::<阿里云账号ID>:user/cigar-app-svc"]
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
```

`<阿里云账号ID>` 替换为账号设置里的 12 位数字 ID。

### 预期结果

- 在 ECS 上用 `cigar-app-svc` 的 AccessKey 调 `ossutil ls oss://cigar-photos` 能列出对象。
- 用主账号 AccessKey 同样命令也能跑（方便运维）。
- 用子账号的 AccessKey **不能**调 ECS / RDS API（权限隔离验证）。

### 注意事项

- **AccessKey Secret 只显示一次**，丢失需要重新生成（旧的会立即失效）。
- 把 `OSS_ACCESS_KEY_ID` 和 `OSS_ACCESS_KEY_SECRET` 写入 `backend/.env`，**文件权限必须 `chmod 600`**。
- **不要把 AccessKey 提交到 git**，`.gitignore` 必须包含 `.env`。
- STS 临时凭证路径前缀限制在 `photos/{user_id}/{date}/`（由后端 `T10` 任务实现），防止恶意用户上传到其他路径。

---

## 8. 成本估算

按"按量付费 + 包月混合"测算，< 20 经理、< 200 客户的实际负载。**所有单价为 2026 年 6 月阿里云官网公开报价**（以购买时控制台显示为准）。

| 资源 | 规格 | 计费方式 | 月成本（¥） | 备注 |
| --- | --- | --- | --- | --- |
| ECS | `ecs.s6-c1m2.large` 2C4G | 包月 | 80 | 跑 Docker + Nginx |
| 系统盘 | ESSD PL1 40GB | 包月 | 12 | |
| 公网带宽 | 5Mbps 固定 | 包月 | 23 | ECS 出方向流量 |
| RDS MySQL | `mysql.n2.medium.1c2g` | 包月 | 90 | 1C2G + 50GB SSD |
| OSS 标准存储 | 20GB（照片）+ 50MB（APK） | 按量 | 5 | 20GB × ¥0.12/GB/月 |
| OSS 流量 | 估 50GB/月（照片下载+管理端） | 按量 | 25 | 公网下行 ¥0.5/GB |
| SSL 证书 | 阿里云免费证书 | 免费 | 0 | DV 单域名 |
| 域名 | `.com` | 年付 | 5 | ¥60/年 ÷ 12 |
| **合计** | | | **≈ 240** | |

**优化**：使用率 < 30% 时 ECS 改按量付费（¥86/月，闲置有风险）。新人优惠券可压到 < ¥150。

---

## 9. 回滚 / 销毁方案

如果上线后发现架构不对，或者只是临时测试用完，需要拆掉所有资源。按以下顺序清理，**避免遗留扣费**。

### 9.1 销毁顺序（从外到内）

1. **DNS**：把 A 记录改成 `127.0.0.1` 或删除，让外部流量立刻断掉。
2. **SSL 证书**：证书列表 → 申请退款（如包年）→ 删除。
3. **OSS Bucket**：先**清空所有文件**（删 Bucket 前必须），再删 Bucket。
4. **RDS**：实例列表 → `cigar` → 释放（**释放后数据不可恢复**，如需保留先做全量备份并下载）。
5. **ECS**：实例 → 释放。释放前 `scp` `/var/log` 和重要配置到本地。
6. **EIP**：如 ECS 释放时未自动释放，到 [EIP 控制台](https://vpc.console.aliyun.com/) 单独释放。
7. **VPC / 安全组 / RAM 子账号 / RAM 角色 / 自定义策略**：全部删除。
8. **域名**：继续持有（不注销可避免续费骚扰）。

### 9.2 销毁后账单核查

释放所有资源后，到 [费用中心](https://billing.aliyun.com/) → **账单管理 → 账单详情**，筛选本月，确认没有按量计费的 ECS / RDS / OSS 还在产生费用。OSS Bucket 释放后流量立即停止，RDS 释放后存储费立即停止。

**判断标准**：临时测试 → 全销毁。长期重做架构 → 保留 OSS 数据 + RDS 备份，其他重建。正式上线 → 仅按需调整规格。

---

## 附录 A：环境变量占位符清单

部署前在 `backend/.env`（权限 600）写入以下变量，**不要硬编码**。

| 变量 | 用途 | 来源 |
| --- | --- | --- |
| `${RDS_HOST}` | RDS 内网地址 | 第 3 节 |
| `${RDS_PORT}` | 3306 | 默认 |
| `${RDS_USER}` | `cigar_app` | 第 3 节 |
| `${RDS_PASSWORD}` | RDS 高权限账号密码 | 团队密码管理器 |
| `${RDS_DATABASE}` | `cigardb` | 第 3 节 |
| `${OSS_ACCESS_KEY_ID}` | RAM 子账号 AccessKey | 第 7 节 |
| `${OSS_ACCESS_KEY_SECRET}` | RAM 子账号 Secret | 团队密码管理器 |
| `${OSS_BUCKET}` | `cigar-photos` | 第 4 节 |
| `${OSS_REGION}` | `oss-cn-hangzhou` 等 | 第 4 节 |
| `${OSS_STS_ROLE_ARN}` | `acs:ram::<id>:role/cigar-sts-role` | 第 7 节 |
| `${JWT_SECRET}` | JWT 签名密钥（≥ 32 位随机） | `openssl rand -hex 32` |
| `${WX_APPID}` | 微信公众号 AppID（暂未用，预留） | 后期接入微信公众号时填 |
| `${AMAP_KEY}` | 高德地图 Web API Key | 高德开放平台申请 |

## 附录 B：跨文档链接

- 计划文档：`/home/wewe/.omo/plans/cigar-collection.md`（Wave 1 → Wave 8 全量任务）
- T1 经验：`/home/wewe/.omo/notepads/cigar-collection/learnings.md`（monorepo 脚手架踩坑）
- 后端 env 模板：`backend/.env.example`（T3 任务产出）
- 下游部署任务：
  - T31：后端 Docker 化 + ECS 部署
  - T32：管理后台 Nginx 部署 + HTTPS
  - T33：APK 打包 + 分发
