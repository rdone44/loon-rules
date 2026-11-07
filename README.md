# loon-rules

Loon、Shadowrocket、Clash/mihomo 和 sing-box 分流配置，以及 Cloudflare Worker 订阅网关。

## 配置

| 文件 | 用途 |
|---|---|
| `Loon.conf` | Loon 主配置 |
| `Shadowrocket.conf` | Shadowrocket 配置 |
| `clash/clash-remote.yaml` | Clash/mihomo 模板，供订阅网关使用 |
| `sing-box/config.json` | sing-box 模板，供客户端或订阅网关使用 |
| `gateway/` | 生成 Clash、Stash 和 sing-box 订阅的 Worker，见 `gateway/README.md` |
| `mihomo.yaml` | 已弃用的历史文件 |

## 分流规则

按所选服务提供 AI、Google、YouTube、Telegram、Twitter/Grok、Meta、Apple 服务、Apple ID、Microsoft、GitHub、Spotify、加密货币、MissAV、广告拦截和国内直连策略。地区筛选与自动选择保留；实际可用地区取决于节点订阅。

- Loon 与 Shadowrocket 使用 [yfamilys 远程文本规则](https://yfamilys.com/rule)。国内 IP 由末尾的 China 规则集中的 `GEOIP,CN` 兜底。
- sing-box 使用 [yfamilys 二进制规则](https://yfamilys.com/sbrule)，另外通过 ChinaIPs 规则集匹配国内 IP。
- Clash/mihomo 对兼容的服务使用 yfamilys 文本规则。YouTube、Spotify、Microsoft 和 Apple 两张表含 mihomo 不支持的 `USER-AGENT`，改用 QuixoticHeart 兼容规则；国内域名通过网关提供的 MetaCubeX `cn.mrs`，国内 IP 使用 yfamilys ChinaIPs。详见 `clash/README.md`。
- 各客户端的规则格式和匹配能力不同，上述来源及 IP、用户代理规则不能保证完全相同。Loon 和 Shadowrocket 的广告表 ADLite 约 5.4 万条，具体数量由上游更新决定。
- AppleID、MissAV、Entire、muse.ai、anyrouter 和 agentrouter 的例外集中在 `rules/exceptions.csv`，由 GitHub Actions 生成 `rules/generated/` 下的文本表和 sing-box 规则集；四个配置只引用生成结果，不再各自维护域名。新增域名只需改 CSV。AppleID 默认直连，需要时手动选择账号地区对应的出口。
- 订阅网关还会为 Clash 注入 `clash/personal-ai.list` 和 `clash/personal-direct.list`，它们优先于模板规则。

## 使用

Loon 在 `[Remote Proxy]` 填入自己的订阅地址并启用；Shadowrocket 在客户端中添加订阅。不要将真实订阅地址、节点凭据或证书提交到仓库。

sing-box 模板的 `自动选择` 节点列表为空；使用订阅网关可自动填入节点，单独使用时需要自行配置节点。不同客户端的支持范围和使用方式见各子目录说明。

原配置中的 CA 已泄露，不要复用；如需 MITM，使用客户端重新生成并信任的证书。
