# loon-rules

Loon / Shadowrocket / Clash 三端分流配置 + kelee 插件镜像。

## 分流规则

**全部引用 [QuixoticHeart/rule-set](https://github.com/QuixoticHeart/rule-set/tree/ruleset/loon)**（每日 07:30 UTC+8 自动构建，合并 blackmatrix7 / MetaCubeX / SukkaW / dnsmasq-china-list 等上游）。

- Loon / Shadowrocket / Clash 三端：远程表 **44 张**，合计 **58,478 条**规则
- sing-box 端：同一批 44 张表，用 `singbox/version5/*.srs` 二进制格式
- 国内 IP 兜底用本地单行 `GEOIP,cn,DIRECT`，不引用任何自建表（仓库里已无 `rule/` 目录）
- `GEOIP,cn` 放本地是安全的：Loon 3.0.3+ 先匹配全部域名类规则，域名没命中才用 DNS 结果匹配 IP 类规则，所以不会抢在远程域名规则之前

### 未引用的表

| 表 | 条数 / 体积 | 原因 |
|---|---|---|
| `cn` | 107,728 行 / 2.8MB | 中国域名全量，引用即卡死；已由 `GEOIP,cn` 兜住 |
| `adrules` | 210,220 行 / 7.2MB | 广告全量，引用即卡死 |
| `cncidr` | 17,958 条 | 中国 IP 段，已由 `GEOIP,cn` 兜住 |
| `cncidr-resolve` | 47 万行 | 同上，且去掉 `no-resolve` 会产生大量无效 DNS 查询 |
| `gfw` | 7,502 条 | 与 `proxy` 表重复 |
| `speedtest` | 278KB | 测速站点，非必需 |

原名引用的 blackmatrix7 表已全部撤掉：其 33 张表里 22 张停更于 2024~2025（`Threads`/`OKX` 停 2024-01、`YouTube`/`Spotify`/`BiliBili`/`Facebook`/`Cloudflare` 停 2025-06、`GitHub` 停 2025-06、`Telegram` 停 2025-09、`Twitter` 停 2025-09、`Microsoft`/`Privacy` 停 2025-12）。

## 文件

| 路径 | 说明 |
|---|---|
| `Loon.conf` | Loon 配置（DNS / 策略组 / 分流 / 插件） |
| `Shadowrocket.conf` | 小火箭配置，与 Loon 同序（插件 / MITM 不迁移） |
| `clash/clash-remote.yaml` | Clash / mihomo 配置，与 Loon 同序 |
| `sing-box/config.json` | sing-box 配置（内核 ≥ 1.9），与 Loon 同序，44 张 `.srs` 规则集，详见 `sing-box/README.md` |
| `gateway/` | Cloudflare Worker 订阅网关，把机场订阅解析成 Clash 配置；读取本仓 `clash/clash-remote.yaml` 与 `clash/personal-*.list`，详见 `gateway/README.md` |
| `mihomo.yaml` | 已弃用，仅历史对照 |

## 使用前必做

1. `[Remote Proxy]` 填入自己的订阅链接，删掉行首 `#`
2. Loon → 设置 → 证书 → 生成 → 安装 → 系统信任（否则去广告插件不生效）

## 配置要点

- DNS 不含 `system`，统一走 223.5.5.5 / doh.pub + Fake-IP，由代理在远端解析
- `sni-sniffing` 必开，否则 App 自带 DoH / 硬编码 IP 的连接拿不到域名，域名规则全部落空
- Apple 三段顺序不能变：`apple-cn`（大陆 CDN，DIRECT）→ `apple-proxy` → `apple`。`apple-cn` 排后面会被 `apple` 全表抢走，App Store 下载变慢
- 本地 `[Rule]` 只有 `GEOIP,cn` + `FINAL`。**不要写 `IP-CIDR,xxx,except=...`**：Loon 官方 IP 规则只支持 `no-resolve`
- 原配置的 CA（ca-p12 / ca-passphrase）已随文件外泄，**不要再用**，用 Loon 自带证书

## 已知情况

- 规则总量 58,478 条，其中 `proxy` 30,047 / `google` 9,310 占 67%。手机端嫌重可只停用这两张
- **美区 Apple ID 改密 / 重置密码**需要 `idmsa` / `iforgot` / `account` / `gsa` 与账号地区同出口。当前规则里 `apns` 只含 `identity.apple.com` + `push.apple.com`，不含这四个；需要时在 `[Remote Rule]` 最前面加一张认证表
- missav.ai 等站点走 Cloudflare，卡在 `Just a moment...` 是 CF 判定出口 IP 可疑，换节点即可
