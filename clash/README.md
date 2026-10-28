# clash/

订阅网关（[`rdone4425/clash-gateway`](https://github.com/rdone4425/clash-gateway)）的配置模板与个人规则库。

| 文件 | 用途 |
| --- | --- |
| `clash-remote.yaml` | **Clash / mihomo 侧的主配置**，与 `Loon.conf` 逐表同序；节点用 `proxy-providers.remote` 提供，网关部署时会把它改写成自己的 `/provider?token=...` |
| `personal-ai.list` | 个人 AI 域名表，命中走 `🤖 AI 服务` |
| `personal-direct.list` | 个人直连域名表，命中走 `🎯 全球直连` |

## 网关入口（实测 2026-10）

`https://clash-gateway.rdone.eu.cc`

| 路径 | 是否需要 token | 用途 | 实测 |
| --- | --- | --- | --- |
| `/` | 否 | 设置页（填 GitHub 配置链接 / 机场订阅 / 订阅名） | 200 |
| `/health` | 否 | 健康检查，返回 `{"status":"ok","version":"1.1.0"}` | 200 |
| `/sub?token=<ACCESS_TOKEN>` | 是 | **Clash 订阅地址**，导入客户端用这个 | 无 token 返回 401 |
| `/provider?token=<ACCESS_TOKEN>` | 是 | 节点源，`proxy-providers` 用 | 无 token 返回 401 |

- 直接打开 `/sub` 或 `/provider` 不带 token 会回 **401**，不是网关坏了
- 设置页支持 `/?token=<ACCESS_TOKEN>`，会把当前设置明文显示出来
- 旧地址 `https://clash-sub.rdone.workers.dev/provider/YOUR-PROFILE-ID` **已失效（404）**，模板里的占位符已改到新网关

## 网关怎么取这些文件

```
CONFIG_URL         → clash/clash-remote.yaml
PERSONAL_RULES_URL → clash/personal-direct.list
                     （网关会砍掉最后一段当目录，再拼 personal-ai.list）
```

两个 `personal-*.list` 必须放在同一目录下，换位置要一起搬。

## 改模板要注意

网关会做三件事，模板得配合：

1. **注入节点**：分组里写 `use: [remote]`，网关会把它换成节点名或自己的 provider 地址
2. **个人规则置顶**：模板里要有名为 `🤖 AI 服务` 和 `🎯 全球直连` 的分组，网关才能把 `RULE-SET` 插到 `rules` 顶部
3. **规则集代理**：`rule-providers` 里指向 `cdn.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/*.mrs` 的会被改写成 `/rules/*.mrs`，避开内核直连 jsdelivr 失败

改完 push 即生效（网关有 1 分钟缓存，Clash 侧按 `profile-update-interval` 刷新）。

## 本地用法

不用网关，把 `clash-remote.yaml` 里的 `proxy-providers.remote.url` 换成自己的机场订阅直链（或者网关的 `/provider?token=...`）即可。

> 根目录的 `mihomo.yaml` 已弃用（仅作历史对照）。Clash 侧只维护本目录这份，两者的规则集顺序与策略完全一致。
