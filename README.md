# Loon 规则集、插件镜像与配置（rdone44/loon-rules）

自用的 Loon 配置仓库：MissAV 家族分流规则、Gemini 全端点分流规则、kelee 插件镜像，以及一份带详细注释的完整 `Loon.conf`。

## 仓库结构

| 路径 | 说明 |
|---|---|
| `Loon.conf` | 完整 Loon 配置模板（DNS / 策略组 / 分流 / 插件） |
| `Shadowrocket.conf` | 小火箭配置，与 Loon.conf 同构分流（插件 / MITM 脚本不迁移） |
| `mihomo.yaml` | mihomo (Clash.Meta) 配置，与 Loon.conf 同构分流（插件 / MITM 脚本不迁移） |
| `clash/` | 订阅网关的配置模板与个人规则库，详见 `clash/README.md` |
| `rule/MissAV.list` | MissAV 家族 + 图片 / 视频 CDN 分流规则 |
| `rule/GlobalExtra.list` | 补 Global.list 关键词规则盖不到的 CDN（前后端同出口） |
| `rule/FinanceCN.list` | 国内银行 / 券商 / 支付 / 保险，固定在「金融应用」组且排在广告表之前 |
| `rule/priority/` | 优先级例外（原 `[Rule]` 本地规则），按策略拆成 6 张表 |
| `rule/AdsExtra.list` | 上游广告表没盖到的字节系广告域名（巨量引擎等），拦截 |
| `rule/WeChat.list` | 微信 / 视频号 / 小程序直连，挡在广告表前面 |
| `rule/Gemini.list` | Gemini / AI Studio / Vertex 全端点分流规则 |
| `rule/category-ads-all.list` | v2fly `category-ads-all` 的 Loon 格式转换（静态，约 900 条） |
| `plugin/*.lpx` | kelee.one 插件镜像（源站被 Cloudflare 阻断） |
| `plugin/RuleLookup.lpx` | 路由规则查看插件（自写，非镜像），配套脚本 `script/RuleLookup.js` |
| `worker/` | 插件查询记录的 Cloudflare Worker + D1 后端与网页，详见 `worker/README.md` |
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

## plugin/RuleLookup.lpx — 路由规则查看

在 Loon 里直接查「这个域名到底走哪个策略」。插件是 `generic` 脚本，**不拦截任何流量、不改配置**，只在插件列表里手动点一下触发。

脚本拉取本仓库的 `Loon.conf`，解析 `[Rule]` / `[Remote Rule]` / `[Proxy Group]`，再按 Loon 的真实顺序复现匹配：

```
本地 [Rule] → 远程表按 [Remote Rule] 顺序自上而下，首条命中生效 → FINAL
```

规则表本身也是从仓库远程拉的（github raw 失败自动切 jsdelivr），所以**改了 `Loon.conf` 不用等 Loon 重新载入配置，插件看到的就是仓库里的最新版本**。

### 用法

`[Plugin]` 加一行：

```ini
https://raw.githubusercontent.com/rdone44/loon-rules/main/plugin/RuleLookup.lpx, enabled=true
```

然后在 Loon → 插件 → 路由规则查看 → 填参数 → 点脚本运行。三个模式：

| 模式 | 作用 |
|---|---|
| `结构概览` | 不联网拉规则表。列出本地规则、44 张远程表的顺序与策略组、每张表当前选中的节点；检查策略组是否存在、有没有重复引用的表、有没有 GEOIP 兜底 |
| `查域名` | 填 `查询域名`（域名或 IPv4）。拉全部规则表（跳过 ChinaIPs），输出**命中链路**：第一条=实际生效的策略，后面的=被抢先的规则 |
| `全量体检` | 拉全部规则表（含 ChinaIPs 约 700KB），估算域名类规则的独占命中率，列出 IP / 其他类型规则数量，以及「完全重复的规则行」和「跨策略抢先」明细 |

### 为什么需要它

`查域名` 输出的是这种，一眼看出为什么 Gemini 没被拖进 Google 组：

```
▶1. Gemini    → AI      （生效，当前 美国自动）  DOMAIN-SUFFIX,gemini.google.com
 2. 谷歌服务   → Google  （被前面的规则抢先，不生效）  DOMAIN-SUFFIX,google.com
 3. 谷歌服务   → Google  （被前面的规则抢先，不生效）  DOMAIN-KEYWORD,google
 4. 全球代理   → 节点选择 （被前面的规则抢先，不生效）  DOMAIN-KEYWORD,google
```

`全量体检` 用生成的候选域名样本估算「哪些域名规则先命中」，不等于整张规则表的总生效率：IP / UA 等规则按数量单独列出，脚本不会把它们误报成无效。例如：

- `隐私上报` 的 20 条规则都被前面的 `去广告` 覆盖：19 条完全重复，`0.0.0.1/32` 落在广告规则 `0.0.0.0/24` 内。可选地停用 Privacy 以少拉一张小表，但会失去独立的隐私规则标签，收益主要是配置简化
- `Copilot` 有 31 条域名规则与前面的 `OpenAI` 重复，策略同为 `AI`，所以结果不变，只增加维护量
- `游戏平台` 有部分域名与 `微软服务` 重叠（包括 `bethesda.net`、`login.live.com` 等）；这些请求实际先走微软组，只有你希望它们改走游戏组时才需要加例外

### 限制

- 匹配模型按官方文档实现：**目标是域名时先按配置顺序跑完所有域名类规则，全不命中才解析 DNS 去跑 IP 规则**；所以 `IP-CIDR` 写在前面也不会抢走后面的域名规则
- 全量体检的域名命中率用合成域名样本估算，只适合发现重复和明显的顺序遮蔽；不能代表真实流量比例，也不评估 IP / GEOIP / UA 规则是否命中
- `IP-CIDR6`、`GEOIP`、`IP-ASN` 不在脚本内计算；域名查不到时脚本会提醒「接下来会转去跑 IP 表，最终可能不是 FINAL」
- `USER-AGENT` / `URL-REGEX` / `PROTOCOL` / `PORT` 这类需要真实请求上下文的规则无法离线判定，不参与匹配
- 域名查询时 `ChinaIPs.list` 被跳过（700KB，且对域名无意义）
- 需要 Loon 3.5.1(983)+（新版 Script 语法 + `[Argument]` 对象参数）；脚本超时设了 120s，网络慢时建议在 Wi-Fi 下跑「全量体检」

### 查询记录（可选）

Loon 的脚本日志和通知都是临时的，翻不了历史。想让每次查询留痕，可以把结果写进 Cloudflare：

1. 按 `worker/README.md` 部署 `worker/`（Workers + D1 + 一个 `LOOKUP_TOKEN`）
2. 插件设置里确认「记录到 Cloudflare」开关打开，填入 `记录密钥`（＝`LOOKUP_TOKEN`）；`记录服务器` 已预填
3. 之后每次运行都会在 `https://<worker>/` 留一条记录：时间、目标、生效策略、规则表、完整命中链路

三个条件的开关关系：**记录开关打开 + 服务器地址 + 密钥** 全满足才上报，任一不满足就只弹通知。记录只存在你自己的 Cloudflare 账号里，密钥不要写进 `.lpx`（仓库是公开的）。

---

## Loon.conf — 配置模板

### 建议的规则整理

- `AliPay.list` 曾在 `[Remote Rule]` 中重复引用；已删除后面那条冗余引用（Shadowrocket / mihomo 原本各只有一份），对应配置已同步
- 购物 / 阅读规则继续放在广告表之前：Advertising 的 `DOMAIN-KEYWORD` 会命中 `ynuf.alipay.com` 和 `kepler.jd.com` 等业务子域；前置商店规则可让这些请求按支付宝 / 京东策略处理。移到广告表后会改变这些子域的路由
- 不要仅因为规则在两张表中重复就调整顺序。先看策略是否不同：`Copilot` / `OpenAI` 都走 AI，重复只增加维护；Xbox / Bethesda 与微软规则重叠则实际走微软组，只有预期是游戏组时才需要写更靠前的例外
- 可选地停用重复的 `Privacy` 表，能少一次小表下载；保留它也有独立标签和上游来源，偏好清晰分类时可以不动。若修改，Loon、Shadowrocket、mihomo 三份配置保持一致
- 国内金融（银行 / 券商 / 支付 / 保险）单独放在 `rule/FinanceCN.list`，引用 `policy=金融应用`，位置在**去广告表之前**：这些域名大多是 `.com`，原先只能靠 `ChinaIPs` 的 IP 匹配兜底，DNS 一旦解析到境外边缘就会被当成代理流量，银行 App 容易报「网络环境异常」。`金融应用` 组默认就是 `DIRECT`，所以当前行为不变，只是不再依赖 IP 结果

使用前必做两件事：

1. `[Remote Proxy]` 填入自己的订阅链接，并删除行首的 `#`
2. Loon → 设置 → 证书 → 生成 → 安装 → 系统信任（否则去广告插件不生效）

配置要点（详见文件内注释）：

- DNS 不含 `system`，统一走 223.5.5.5 / doh.pub + Fake-IP，由代理在远端解析，防止查询泄露
- `sni-sniffing` 必开，否则 App 自带 DoH / 硬编码 IP 的连接拿不到域名，域名规则全部落空
- Gemini 规则必须排在 Google 规则之前；本地 `[Rule]` 现在**只剩 `FINAL`**，全部例外（含原 `[Rule]` 里那 18 条）已按策略移到 `rule/priority/` 的远程表，并放在 `[Remote Rule]` 最前面；不放 GEOIP 兜底，否则广告表永远轮不到
- 原配置的 CA（ca-p12 / ca-passphrase）已随文件外泄，**不要再用**，用 Loon 自带证书

## 注意

- missav.ai 等站点走 Cloudflare，如果浏览器卡在 `Just a moment...`，那是 CF 风控判定出口 IP 可疑，**换节点**（住宅型节点过率更高），不是规则问题。
