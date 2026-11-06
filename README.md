# Loon 规则集、插件镜像与配置（rdone44/loon-rules）

自用的 Loon 配置仓库：Apple 账户认证三段分流、QuixoticHeart 每日构建规则集镜像、kelee 插件镜像，以及一份带详细注释的完整 `Loon.conf`。

## 规则来源原则

分流规则**优先用 [QuixoticHeart/rule-set](https://github.com/QuixoticHeart/rule-set)**（每日 07:30 UTC+8 自动构建，合并 blackmatrix7 / MetaCubeX / SukkaW / dnsmasq-china-list 等上游）：

| 情况 | 用谁 |
|---|---|---|
| QuixoticHeart 有对应表 | **用它的**（`@ruleset/loon/*.list`） |
| 它没有（认证 / 自有域名 / 国内金融购物 / 广告 / 国内地图 / Gemini / MissAV / LINE / Grok / Meta 补充 / OKX 与加密补充 / 全球兜底） | 本仓库自建表 |
| 它太大不能用（`cn` 107k 行 2.8MB、`adrules` 210k 行 7MB、`proxy` 30k 行、`google` 9.3k 行） | 上游 blackmatrix7 的精选小表（`China` / `Google` / `Advertising` / `Hijacking` / `Privacy` / `Apple` / `Global` / `Cloudflare` / `Telegram` / 阿里 / 支付宝 / 拼多多 / 京东） |

为什么换：上游 blackmatrix7 的 33 张表里 **22 张停更于 2024~2025**（`Threads` 停 2024-01-08、`OKX` 停 2024-01-08、`YouTube`/`Spotify`/`BiliBili`/`Facebook`/`Hijacking`/`Cloudflare` 停 2025-06-06、`GitHub` 停 2025-06-12、`Telegram` 停 2025-09-10、`Twitter` 停 2025-09-28、`Microsoft`/`Privacy` 停 2025-12-08）。

## 仓库结构

| 路径 | 说明 |
|---|---|
| `Loon.conf` | 完整 Loon 配置模板（DNS / 策略组 / 分流 / 插件） |
| `Shadowrocket.conf` | 小火箭配置，与 Loon.conf 同构分流（插件 / MITM 脚本不迁移） |
| `mihomo.yaml` | **已弃用**，仅作历史对照；Clash 侧请用 `clash/clash-remote.yaml` |
| `clash/` | 订阅网关的配置模板与个人规则库，详见 `clash/README.md` |
| `rule/AppleID.list` | Apple 账户认证（改密 / 重置密码 / 双重认证），**必须排在所有规则之前** |
| `rule/MissAV.list` | MissAV 家族 + 图片 / 视频 CDN 分流规则 |
| `rule/GlobalExtra.list` | 补 Global.list 关键词规则盖不到的 CDN（前后端同出口） |
| `rule/FinanceCN.list` | 国内银行 / 券商 / 支付 / 保险，固定在「金融应用」组且排在广告表之前 |
| `rule/CNGeo.list` | `GEOIP,cn` 全量中国 IP 兜底（一条顶替 19619 条 ChinaIPs） |
| `rule/priority/` | 优先级例外（原 `[Rule]` 本地规则），按策略拆成 6 张表 |
| `rule/AdsExtra.list` | 上游广告表没盖到的字节系广告域名（巨量引擎等），拦截 |
| `rule/WeChat.list` | 微信 / 视频号 / 小程序直连，挡在广告表前面 |
| `rule/Carrier.list` | 三大运营商 / 广电的 `.com` 域名直连 |
| `rule/CNMap.list` | 高德 / 百度地图 / 腾讯地图直连（排广告表之后，保留 `apiinit.amap.com` 拦截） |
| `rule/Gemini.list` | Gemini / AI Studio / Vertex 全端点分流规则 |
| `rule/category-ads-all.list` | v2fly `category-ads-all` 的 Loon 格式转换（静态，约 900 条，**当前未引用**） |
| `plugin/*.lpx` | kelee.one 插件镜像（源站被 Cloudflare 阻断） |
| `plugin/blockAds-finance-safe.plugin` | fmz200 blockAds 的金融风控安全派生版 |
| `script/*.js` | 插件引用的脚本（镜像插件的 `script-path` 已重定向到本仓库） |

## 在 Loon 里引用

`[Remote Rule]` 加一行（策略自己定，建议和主站同一个组）：

```ini
https://raw.githubusercontent.com/rdone44/loon-rules/main/rule/MissAV.list, policy=节点选择, tag=MissAV, enabled=true
```

GitHub 直连不通时用镜像：

```ini
https://cdn.jsdelivr.net/gh/rdone44/loon-rules@main/rule/MissAV.list, policy=节点选择, tag=MissAV, enabled=true
```

规则本身**不带策略**，策略在引用时通过 `policy=` 指定。

---

## rule/MissAV.list — MissAV 家族分流

MissAV 家族（含全部镜像域名、姊妹站 NJAV / ThisAV）以及它的图片、视频 CDN 的分流规则。

### 为什么需要这个规则集

`DOMAIN-KEYWORD,missav` 只能覆盖含 "missav" 的域名，而这个家族的**图片和视频 CDN 域名里一个 missav 都没有**：

| 域名 | 用途 | 含 missav |
|---|---|---|
| `avdaisukicp.com` | 封面/缩略图 CDN | ❌ |
| `fourhoi.com` | 封面图 CDN | ❌ |
| `surrit.com` | 视频 m3u8 流 | ❌ |
| `njav.tv` | 姊妹站 NJAV | ❌ |
| `thisav.com` | 姊妹站 ThisAV | ❌ |

不补这些，典型症状是：**页面能打开，缩略图一片空白，点进去视频一直转圈**。

镜像域名更新很快。发现新镜像打不开时，先看它是否含 `missav` —— 含的话本规则已覆盖；不含就提 issue / PR 补一行。

---

## rule/Gemini.list — Gemini 全端点分流

上游 blackmatrix7 的 Gemini 规则只有 13 条，覆盖不到 AI Studio、Vertex AI 和各家 `*-pa.clients6.google.com` / `*-pa.googleapis.com` 后端。这些请求会被 Google.list 的 `googleapis.com` / `google.com` 接走 → Google 组，而 `gemini.google.com` 前端在 AI 组——两个组出口不同国家，Google 的地区校验看请求出口 IP，于是表现为 **"Gemini 在当前地区不可用"**。

本文件把前端、后端、AI Studio / Vertex / DeepMind 端点统一收进一份，配合 `policy=AI` 引用即可保证前后端同出口。

用法（`[Remote Rule]`，**必须放在 Google.list 之前**）：

```ini
https://raw.githubusercontent.com/rdone44/loon-rules/main/rule/Gemini.list, policy=AI, tag=Gemini, enabled=true
```

通用 Google 服务（Gmail / 搜索 / gstatic / reCAPTCHA）刻意不收，仍由 Google.list 走 Google 组，否则 Gmail 会被拖进 AI 组。

---

## rule/category-ads-all.list — 轻量去广告规则集

v2fly 官方 [category-ads-all](https://github.com/v2fly/domain-list-community/blob/release/category-ads-all.txt) 的 Loon 格式转换（`domain:` → `DOMAIN-SUFFIX`、`full:` → `DOMAIN`、`keyword:` → `DOMAIN-KEYWORD`，忽略 regexp 条目），静态约 900 条。

> yuumimi 的同名转换文件混入了大量合法域名（youtube / github / openai 等），不可用，故自行转换。

用法（`[Remote Rule]`）：

```ini
https://raw.githubusercontent.com/rdone44/loon-rules/main/rule/category-ads-all.list, policy=全球拦截, tag=去广告, enabled=true
```

---

## plugin/ — 插件镜像

kelee.one 被 Cloudflare 风控时常 403/5xx，仓库镜像了在用的 kelee 插件（`.lpx`），并把插件内部 `script-path` 重定向到本仓库 `script/`。`Loon.conf` 的 `[Plugin]` 段已配置为从镜像加载；未镜像的插件仍走 kelee.one 原地址，源站被挡时会加载失败。

更新镜像：重新下载原版，头部加上「引用链接 + 镜像自 kelee.one」两行注释后覆盖 `plugin/` 同名文件。

### plugin/blockAds-finance-safe.plugin — 去广告插件（金融风控安全版）

fmz200 [blockAds.plugin](https://github.com/fmz200/wool_scripts/blob/main/Loon/plugin/blockAds.plugin)（约 730 款 App/小程序去广告合集）的安全派生版，**唯一改动是收窄 MITM 解密范围**：

- 从 `[MITM] hostname` 剔除共 **119 个**银行 / 券商 / 支付 / 保险 / 运营商 / 风控类域名（中行、建行、工行、农行、交行、招行、浦发、光大、民生、华夏、邮储、中信、平安、北京/江苏/吉林银行、农商行，国泰君安/华泰/银河/兴业/招商/长城证券、东方财富/同花顺/富途，财付通/拉卡拉/翼支付/银盛/合利宝/壹钱包/深圳通，友邦/太平/人保/国寿/汇丰，移动/联通/电信/广电，闲鱼 goofish 风控 ACS 等）
- 禁用 9 条会破坏 App 主业务流量的规则
- 其余内容（去广告规则 / 脚本 / 重写）与原版一致；被剔除接口的 App 仍能被规则级拦截广告，只是不做脚本级改写

原因：银行、券商、支付类 App 检测到 MITM 会报「网络环境异常」甚至锁交易。原版合集覆盖这些域名时风险大于收益。

用法（`[Plugin]`）：

```ini
https://raw.githubusercontent.com/rdone44/loon-rules/main/plugin/blockAds-finance-safe.plugin, enabled=true
```

> 原版更新后想跟进：重新下载原版，重跑同样的剔除（见 git 历史里各 fix(plugin) 提交的清单），别直接覆盖本文件。

---

---

## Loon.conf — 配置模板

### 建议的规则整理

- `AliPay.list` 曾在 `[Remote Rule]` 中重复引用；已删除后面那条冗余引用（Shadowrocket / mihomo 原本各只有一份），对应配置已同步
- 购物 / 阅读规则继续放在广告表之前：Advertising 的 `DOMAIN-KEYWORD` 会命中 `ynuf.alipay.com` 和 `kepler.jd.com` 等业务子域；前置商店规则可让这些请求按支付宝 / 京东策略处理。移到广告表后会改变这些子域的路由
- 不要仅因为规则在两张表中重复就调整顺序。先看策略是否不同：`Copilot` / `OpenAI` 都走 AI，重复只增加维护；Xbox / Bethesda 与微软规则重叠则实际走微软组，只有预期是游戏组时才需要写更靠前的例外
- 可选地停用重复的 `Privacy` 表，能少一次小表下载；保留它也有独立标签和上游来源，偏好清晰分类时可以不动。若修改，Loon、Shadowrocket、mihomo 三份配置保持一致
- 国内金融（银行 / 券商 / 支付 / 保险）单独放在 `rule/FinanceCN.list`，引用 `policy=金融应用`，位置在**去广告表之前**：这些域名大多是 `.com`，原先只能靠 `ChinaIPs` 的 IP 匹配兜底，DNS 一旦解析到境外边缘就会被当成代理流量，银行 App 容易报「网络环境异常」。`金融应用` 组默认就是 `DIRECT`，所以行为不变，只是不再依赖 IP 结果
- **国内兜底用 `GEOIP,cn`（`rule/CNGeo.list`），不要再引用 `ChinaIPs.list`（19619 条）或 `ChinaDomain.list`（3708 条）**：两者合计曾占全配置 78%，手机端规则引擎会被压垮，表现就是 App Store 大文件下载变慢。同理不要引用 QuixoticHeart 的 `cn.list`（107k 行）
- **Apple 分三段**：`AppleID.list`（认证，走 `AppleID` 组）→ `apple-cn.list`（大陆 CDN，DIRECT）→ `apple-proxy.list`（需代理域，苹果服务）。`priority/direct.list` 里的 `IP-CIDR,17.0.0.0/8,no-resolve` 保 App Store 下载直连，别删
- **不要写 `IP-CIDR,xxx,except=...`**：Loon 官方 IP 规则文档只支持 `no-resolve`，没有 `except` 参数（详见 `rule/priority/direct.list` 注释）

使用前必做两件事：

1. `[Remote Proxy]` 填入自己的订阅链接，并删除行首的 `#`
2. Loon → 设置 → 证书 → 生成 → 安装 → 系统信任（否则去广告插件不生效）

配置要点（详见文件内注释）：

- DNS 不含 `system`，统一走 223.5.5.5 / doh.pub + Fake-IP，由代理在远端解析，防止查询泄露
- `sni-sniffing` 必开，否则 App 自带 DoH / 硬编码 IP 的连接拿不到域名，域名规则全部落空
- Gemini 规则必须排在 Google 规则之前；本地 `[Rule]` 现在**只剩 `FINAL`**，全部例外（含原 `[Rule]` 里那 18 条）已按策略移到 `rule/priority/` 的远程表，并放在 `[Remote Rule]` 最前面；不放 GEOIP 兜底，否则广告表永远轮不到
- 原配置的 CA（ca-p12 / ca-passphrase）已随文件外泄，**不要再用**，用 Loon 自带证书

## 注意

- 规则表总量已从 29,816 条降到 **7,908 条**（-73%），主要是删掉 `ChinaIPs`（19619）与 `ChinaDomain`（3708）、改用 `GEOIP,cn`。
- `plugin/` 里 24 个 kelee `.lpx` 目前源站返回 403（Cloudflare 风控），与规则无关；用到请自行换镜像地址。
- missav.ai 等站点走 Cloudflare，如果浏览器卡在 `Just a moment...`，那是 CF 风控判定出口 IP 可疑，**换节点**（住宅型节点过率更高），不是规则问题。
