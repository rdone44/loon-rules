# rule/ — 规则集一览

Loon / Surge 通用格式（`DOMAIN-SUFFIX,xxx` 纯规则行），规则本身不带策略，引用时用 `policy=` 指定。Clash 也能用（需包成 payload）。

| 文件 | 应用 / 用途 | 建议 policy | 说明 |
|---|---|---|---|
| [MissAV.list](MissAV.list) | MissAV（全镜像）+ 姊妹站 NJAV / ThisAV + 图片 / 视频 CDN | 自定（建议 `MissAV` 组） | CDN 域名不含 missav 关键字，需单独列 |
| [Gemini.list](Gemini.list) | Gemini / AI Studio / Vertex AI / DeepMind 全端点 | `AI` | 上游 Gemini 规则只有 13 条，本表补齐 `*-pa` 后端；必须排在 Google.list 之前 |
| [MetaExtra.list](MetaExtra.list) | Meta 系补充（Facebook / Instagram / Threads / WhatsApp 四张表没覆盖的域名） | `Meta` | 定期对照上游，补了就删 |
| [TomatoNovel.list](TomatoNovel.list) | 番茄小说（字节系阅读） | `DIRECT` | 走代理必卡 |
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
