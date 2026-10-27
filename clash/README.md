# clash/

订阅网关（[`rdone4425/clash-gateway`](https://github.com/rdone4425/clash-gateway)）的配置模板与个人规则库。

| 文件 | 用途 |
| --- | --- |
| `clash-remote.yaml` | 配置模板。分组用 `use: [remote]` 占位，网关部署时注入节点或重写成自己的 `/provider` 地址 |
| `personal-ai.list` | 个人 AI 域名表，命中走 `🤖 AI 服务` |
| `personal-direct.list` | 个人直连域名表，命中走 `🎯 全球直连` |

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

不用网关，直接把 `clash-remote.yaml` 里的 `proxy-providers.remote.url` 换成自己的订阅地址即可；或者用根目录的 `mihomo.yaml`（与 Loon.conf 同构，但分组结构不同，不要和本文件混用）。
