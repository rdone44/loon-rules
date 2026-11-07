# sing-box 配置

`config.json` 按 Loon 选定的服务重建，使用 [yfamilys sing-box 规则](https://yfamilys.com/sbrule)的远程 `.srs` 文件。配置使用新式 DNS 和路由动作，面向 sing-box 1.13 及以上；客户端实际支持版本需以其内核为准。

使用前需要提供节点：`自动选择` 的 `outbounds` 为空，直接使用模板时请添加出站并填入节点 tag；通过订阅网关的 `/singbox` 获取时，网关会将订阅节点注入并生成地区组。网关生成的订阅由客户端提供入站。

规则顺序先处理局域网和 AppleID、MissAV、Entire、muse.ai、anyrouter、agentrouter 的例外，再处理广告、各服务及国内直连。例外来自 `rules/exceptions.csv` 生成的 source 格式规则集，与 Loon、Shadowrocket、Clash 共用同一份源表。国内 IP 使用 yfamilys `ChinaIPs.srs`；未被前面规则匹配的域名会先使用本地 DNS 解析，再检查国内 IP，仍未命中时走 `节点选择`。

`.srs` 与 Loon 文本规则支持的匹配类型不同，尤其不能假定 `USER-AGENT`、`IP-ASN`、`GEOIP` 和所有例外完全等效。`AppleID` 默认直连，需要时切换账号地区相应的出口；业务策略可选 `节点选择`，再从其中选用网关生成的地区组。

配置语法和运行行为需要用实际客户端内核验证。网关测试可在 `gateway/` 执行 `npm test`；设置 `SINGBOX_CLI` 后可运行 `npm run test:e2e` 验证真实内核。
