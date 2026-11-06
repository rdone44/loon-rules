# sing-box 配置

与 `Loon.conf` / `Shadowrocket.conf` / `clash-remote.yaml` 同序的第四端配置，规则集全部来自
[QuixoticHeart/rule-set](https://github.com/QuixoticHeart/rule-set/tree/ruleset/singbox) 的
`singbox/version5/`（`.srs` 二进制格式），共 44 张，顺序与 Loon `[Remote Rule]` 一一对应。

## 要求

- **内核 ≥ v1.9.0**：规则集用 version5 格式（`domain_suffix` 语义更新）
- 远程规则集需要 `experimental.cache_file.enabled`（已配），否则每次启动重新下载

## 用之前必须改

`outbounds` 里没有任何节点。把你的节点按下面的形状加进去，并把 `自动选择` 的
`outbounds` 填成节点 tag 列表：

```json
{ "type": "shadowsocks", "tag": "hk-01", "server": "...", "server_port": 443,
  "method": "2022-blake3-aes-128-gcm", "password": "..." }
```

```json
{ "type": "urltest", "tag": "自动选择",
  "outbounds": ["hk-01", "us-01"], "url": "https://www.gstatic.com/generate_204" }
```

订阅用户也可以不改配置，把节点交给客户端界面导入（SFI / Karing / Hiddify 都支持）。

## 结构

| 段 | 内容 |
|---|---|
`dns.servers` | `dns-remote`（DoH via 代理）· `dns-direct`（本地）· `dns-fakeip`（198.18.0.0/15） |
`dns.rules` | 局域网 / private 表 / 大陆表走 `dns-direct`；A/AAAA 走 `dns-fakeip`；其余 `dns-remote` |
`inbounds` | 单个 `tun`（172.19.0.1/30，mixed 栈，`auto_route`）；sniff 已改为 `route.rules` 首条规则动作 |
`outbounds` | `节点选择`(selector) → `自动选择`(urltest) + 16 个按业务的 selector + `direct` / `block` |
`route.rules` | 18 条：首条 `sniff` 规则动作，其余 17 条顺序同 Loon：大陆直连 → httpdns 拦截 → Apple → AI → 流媒体 → 社交 → 游戏/加密/金融 → 开发云 → 通用代理 → 抖音 |

## 与 Loon 的差异

- **没有 `GEOIP,cn`**：Loon 那份用本地 `GEOIP,cn,DIRECT` 兜底国内 IP。sing-box 的 `geoip` 字段自
  1.8.0 起废弃，不写。国内直连只靠 `apple-cn` / `microsoft-cn` / `games-cn` / `socialmedia-cn` /
  `iplocation-direct` / `douyin` 这几张域名表 + `final` 走代理。
  要补国内 IP 兜底可以加一张 `cncidr.srs`（`https://cdn.jsdelivr.net/gh/QuixoticHeart/rule-set@ruleset/singbox/version5/cncidr.srs`），
  17,958 条，放在 `route.rules` 最后一条之前。
- **没有 `cn.srs`**：10.7 万行，会压垮手机端，理由同 Loon 那份。
- **Apple 认证**：和另外三端一样，`apns` 只含 `identity.apple.com` + `push.apple.com`，不含
  `idmsa` / `iforgot` / `account` / `gsa`。美区账号改密/重置需自己补一张认证规则集放在最前面。

## 校验

```bash
python ../loon/_verify_singbox.py        # 结构 + 44 个 URL 可下载
python ../loon/_check_singbox_order.py   # 与 Loon [Remote Rule] 顺序比对
```
