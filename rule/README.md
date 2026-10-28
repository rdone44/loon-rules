# rule/ — 规则集一览

Loon / Surge 通用格式（`DOMAIN-SUFFIX,xxx` 纯规则行），规则本身不带策略，引用时用 `policy=` 指定。Clash 也能用（需包成 payload）。

| 文件 | 应用 / 用途 | 建议 policy | 说明 |
|---|---|---|---|
| [MissAV.list](MissAV.list) | MissAV（全镜像）+ 姊妹站 NJAV / ThisAV + 图片 / 视频 CDN | 自定（建议 `MissAV` 组） | CDN 域名不含 missav 关键字，需单独列 |
| [Gemini.list](Gemini.list) | Gemini / AI Studio / Vertex AI / DeepMind 全端点 | `AI` | 上游 Gemini 规则只有 13 条，本表补齐 `*-pa` 后端；必须排在 Google.list 之前 |
| [MetaExtra.list](MetaExtra.list) | Meta 系补充（Facebook / Instagram / Threads / WhatsApp 四张表没覆盖的域名） | `Meta` | 定期对照上游，补了就删 |
| [TomatoNovel.list](TomatoNovel.list) | 番茄小说（字节系阅读） | `DIRECT` | 走代理必卡；广告 SDK 已抽到 AdsExtra 拦截 |
| [GlobalExtra.list](GlobalExtra.list) | Global.list 关键词规则盖不到的 CDN（`pinimg.com` / `phncdn.com`） | `节点选择`（同主站） | 避免“页走 A 组、图片走 B 组” |
| [FinanceCN.list](FinanceCN.list) | 国内银行 / 券商 / 支付 / 保险 | `金融应用`（默认 DIRECT） | 这些 `.com` 域名只能靠 IP 兜底，解析到境外边缘就会被当代理流量 |
| [AdsExtra.list](AdsExtra.list) | 上游广告表和去广告插件都没盖到的字节系广告域名 + 番茄广告 SDK | `全球拦截` | 必须排在 `TomatoNovel.list` 之前，否则会被它的 DIRECT 抢走 |
| [WeChat.list](WeChat.list) | 微信 / 视频号 / 小程序 / 微信下载与视频 CDN | `DIRECT` | 必须排在 `Advertising.list` 之前：广告表有 `DOMAIN-KEYWORD,wxsnsdy` 会拦掉视频号 CDN |
| [Carrier.list](Carrier.list) | 三大运营商 / 广电的 `.com` 域名 | `DIRECT` | `.cn` 已被 `China.list` 的 `.cn` 后缀覆盖，这里只补 `.com` |
| [CNMap.list](CNMap.list) | 高德 / 百度地图瓦片 / 腾讯地图 | `DIRECT` | 必须排在 `Advertising.list` **之后**，否则会放行 `apiinit.amap.com` 埋点 |
| [priority/](priority/) | 优先级例外（原 `Loon.conf [Rule]` 的 18 条本地规则） | 各表不同，按策略拆开 | 必须排在 `[Remote Rule]` 最前，否则会被后面的表抢走 |
| [MyDomains.list](MyDomains.list) | 自有服务器域名 | `DIRECT` | 纯 `DOMAIN-SUFFIX` / `DOMAIN-KEYWORD` |
| [category-ads-all.list](category-ads-all.list) | 去广告（轻量，约 900 条） | 拦截组（如 `全球拦截`） | v2fly 官方 `category-ads-all` 的 Loon 格式转换，静态更新 |

## 引用示例

`[Remote Rule]` 每个文件加一行，例如：

```ini
https://raw.githubusercontent.com/rdone44/loon-rules/main/rule/MissAV.list, policy=MissAV, tag=MissAV, enabled=true
```

GitHub 直连不通时换成 jsdelivr 镜像：

```ini
https://cdn.jsdelivr.net/gh/rdone44/loon-rules@main/rule/MissAV.list, policy=MissAV, tag=MissAV, enabled=true
```
