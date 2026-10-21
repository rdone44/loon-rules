# MissAV 规则集（Loon / Surge / Clash 通用 .list）

MissAV 家族（含全部镜像域名、姊妹站 NJAV / ThisAV）以及它的图片、视频 CDN 的分流规则。

## 为什么需要这个规则集

`DOMAIN-KEYWORD,missav` 只能覆盖含 "missav" 的域名，而这个家族的**图片和视频 CDN 域名里一个 missav 都没有**：

| 域名 | 用途 | 含 missav |
|---|---|---|
| `avdaisukicp.com` | 封面/缩略图 CDN | ❌ |
| `fourhoi.com` | 封面图 CDN | ❌ |
| `surrit.com` | 视频 m3u8 流 | ❌ |
| `njav.tv` | 姊妹站 NJAV | ❌ |
| `thisav.com` | 姊妹站 ThisAV | ❌ |

不补这些，典型症状是：**页面能打开，缩略图一片空白，点进去视频一直转圈**。

## 在 Loon 里使用

`[Remote Rule]` 加一行（策略自己定，建议和主站同一个组）：

```ini
https://raw.githubusercontent.com/rdone4425/loon-rules/main/rule/MissAV.list, policy=节点选择, tag=MissAV, enabled=true
```

GitHub 直连不通时用镜像：

```ini
https://cdn.jsdelivr.net/gh/rdone4425/loon-rules@main/rule/MissAV.list, policy=节点选择, tag=MissAV, enabled=true
```

## 文件说明

- `rule/MissAV.list` — Loon / Surge 语法（`DOMAIN-SUFFIX,xxx` 这种纯规则行），Clash 也能用（需包成 payload）
- 规则本身**不带策略**，策略在引用时通过 `policy=` 指定

## 注意

- missav.ai 等站点走 Cloudflare，如果浏览器卡在 `Just a moment...`，那是 CF 风控判定出口 IP 可疑，**换节点**（住宅型节点过率更高），不是规则问题。
- 这类站点镜像域名更新很快。发现新镜像打不开时，先看它是否含 `missav` —— 含的话本规则已覆盖；不含就提 issue / PR 补一行。
