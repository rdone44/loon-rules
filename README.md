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
https://raw.githubusercontent.com/rdone44/loon-rules/main/rule/MissAV.list, policy=节点选择, tag=MissAV, enabled=true
```

GitHub 直连不通时用镜像：

```ini
https://cdn.jsdelivr.net/gh/rdone44/loon-rules@main/rule/MissAV.list, policy=节点选择, tag=MissAV, enabled=true
```

## 文件说明

- `rule/MissAV.list` — Loon / Surge 语法（`DOMAIN-SUFFIX,xxx` 这种纯规则行），Clash 也能用（需包成 payload）
- 规则本身**不带策略**，策略在引用时通过 `policy=` 指定

## 注意

- missav.ai 等站点走 Cloudflare，如果浏览器卡在 `Just a moment...`，那是 CF 风控判定出口 IP 可疑，**换节点**（住宅型节点过率更高），不是规则问题。
- 这类站点镜像域名更新很快。发现新镜像打不开时，先看它是否含 `missav` —— 含的话本规则已覆盖；不含就提 issue / PR 补一行。

## plugin/blockAds-finance-safe.plugin — 去广告插件（金融风控安全版）

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
