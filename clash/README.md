# Clash / mihomo 配置

`clash-remote.yaml` 是订阅网关使用的配置模板。节点由网关注入；独立使用时需要配置 `proxy-providers.remote.url`。保留用户选择的服务策略，以及网关要求的 `🤖 AI 服务` 和 `🎯 全球直连` 隐藏组。

远程规则与 Loon 尽量对齐：

- 大多数表来自 `yfamilys.com/rule/*.list`，使用 `classical` / `text`。
- yfamilys 的 YouTube、Spotify、Microsoft、AppleProxy、Apple 表含 `USER-AGENT`；mihomo 不支持该规则类型，因此五张表使用 QuixoticHeart 的兼容文本表，覆盖范围不保证完全相同。
- 国内域名使用网关 `/rules/cn.mrs` 提供的 MetaCubeX 规则，国内 IP 使用 yfamilys `ChinaIPs.list`。
- AppleID、MissAV、Entire、muse.ai、anyrouter 和 agentrouter 的例外由 `rules/exceptions.csv` 生成，与 Loon 共用同一份源表。

网关会将 `personal-ai.list` 与 `personal-direct.list` 置于模板规则之前。它们属于个人例外，修改后需要发布到网关读取的仓库位置。

`/stash` 与本模板中的 `classical` 规则集兼容性尚未完成验证；请在 Stash 客户端实测，不要把 mihomo 的解析结果当作 Stash 解析结果。网关设置及当前入口见 `../gateway/README.md`。
