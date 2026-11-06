> 公开仓库，`wrangler.jsonc` 里不含真实 token。部署前用 `npx wrangler secret put ACCESS_TOKEN` 和 `npx wrangler secret put SUBSCRIPTION_URL` 写入 secret，不要把真实值提交上来。

# Clash Gateway

一个 Cloudflare Worker：从 GitHub 拉取配置模板，把节点注入进去，按客户端返回 Clash / Stash / **sing-box** 三种订阅。

- Clash 模板在 [`rdone44/loon-rules`](https://github.com/rdone44/loon-rules) 的 `clash/`，sing-box 模板在 `sing-box/`，改完 push 就生效
- 节点只在 Worker 内存和边缘缓存里，不写入 GitHub
- 订阅地址保存在 Worker secret / KV，不出现在前端或仓库

## 架构

```
Clash    → /sub?token=...       → 拉 Clash 模板 → 重写 provider URL → 返回 YAML
Clash    → /provider?token=...  → 拉机场订阅 → 解析节点 → 返回 proxies
Stash    → /stash?token=...     → 同上，但规则集换成 yaml 文本并展开个人规则
sing-box → /singbox?token=...   → 拉 sing-box 模板 → 节点转成 outbounds → 返回 JSON
```

## sing-box 支持

`/singbox` 把订阅里的节点转成 sing-box 的 outbounds，套在 `sing-box/config.json` 模板上。

- **只提供出站侧**：模板里的 `inbounds` 会被去掉，TUN / mixed 等入站由客户端（SFI / Karing / Hiddify）自己管；`route.rules` 里对 inbound 的限定也一并去掉，否则 `sniff` 规则会变成死规则
- **节点填满 `自动选择`**：模板里 `urltest.outbounds` 是空数组，网关用节点列表填满
- **地区组**：按节点名识别国旗 / ISO 码，生成同名的 `urltest` 组，并挂进 `节点选择`

节点类型与字段映射以 sing-box v1.14.4 的源码为准，每条映射都用真实内核 `sing-box check` 验证过：

| Clash 类型 | sing-box | 说明 |
|---|---|---|
| `ss` | `shadowsocks` | method 超出 sing-box 支持集则跳过 |
| `ss` + `plugin` | `shadowsocks` + `plugin` | 只支持 `obfs-local` / `v2ray-plugin`，别名自动归一化 |
| `vmess` / `vless` / `trojan` | 同名 | `network` → `transport`；`reality-opts` → `tls.reality` |
| `hysteria2` | `hysteria2` | obfs 只认 `salamander` / `gecko` |
| `tuic` | `tuic` | uuid 必须合法，否则跳过 |
| `socks5` / `http` | `socks` / `http` | |
| `ssr` | — | sing-box 1.6.0 起已硬删除，一律跳过 |

**我会跳过而不是产出脏字段。** 跳过的节点会写进日志（`level: warn`），不影响其余节点。

## 部署

要求：Cloudflare 账号、Node 20+。

```bash
npm install
npx wrangler login
npm run deploy
```

### 线上实例

| 项目 | 值 |
|---|---|
| 地址 | `https://sub.opcf.us.ci` |
| Cloudflare 账号 | Rdone4425（账号 ID `3a5fd31272d4bcea5eb40aaf4f06621d`） |
| Worker | `clash-gateway` |
| KV | `clash-gateway-PROFILES`（`0c3851a9658c4a07b55562c7abd06f28`） |
| 自定义域 | `sub.opcf.us.ci`（zone `opcf.us.ci`） |

**不要用 `*.workers.dev` 域名。** 同一份代码部署到 `clash-gateway.4425.workers.dev` 后
所有请求返回 `error code: 1101`；同账号下 2026-06 就在的老 Worker 也一样，
而自定义域 `heh.opcf.us.ci` / `sub.opcf.us.ci` 完全正常。实测该网络下
`workers.dev` 的解析被污染成 Facebook 的 IPv6 段（`2a03:2880:*:face:b00c::`），
用 `--resolve` 钉死 Cloudflare 真实 IP 也依旧 1101。

绑定自定义域走 Workers 的 custom domain API（**不是** DNS 记录，也不是 `workers/routes`）：

```bash
curl -X PUT "https://api.cloudflare.com/client/v4/accounts/$ACC/workers/domains" \
  -H "Authorization: Bearer $CF_TOKEN" -H "Content-Type: application/json" \
  -d '{"environment":"production","hostname":"sub.opcf.us.ci","service":"clash-gateway","zone_id":"7c6d1d619c5e57b6f97190b174c4d1e9"}'
```

`PUBLIC_BASE` 必须改成这个自定义域，否则 `/sub` 回写的 provider URL 会指向 workers.dev。

## 配置

必须设置两个 secret：

```bash
npx wrangler secret put ACCESS_TOKEN
npx wrangler secret put SUBSCRIPTION_URL
```

- `ACCESS_TOKEN`：调用 `/sub` 和 `/provider` 的令牌，自己生成一串随机字符
- `SUBSCRIPTION_URL`：机场订阅地址

可选变量在 `wrangler.jsonc`：

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `CONFIG_URL` | GitHub 上的 `clash-remote.yaml` | Clash 配置模板地址 |
| `CONFIG_SINGBOX_URL` | GitHub 上的 `sing-box/config.json` | sing-box 模板地址 |
| `CACHE_TTL` | `300` | 模板缓存秒数（两种模板共用） |
| `NODE_TTL` | `1800` | 节点缓存秒数 |
| `PROVIDER_INTERVAL` | `1800` | Clash 拉节点的间隔 |
| `SUBSCRIPTION_UA` | `v2rayN/6.42` | 拉订阅时的 UA |

## 使用

1. 打开 `https://sub.opcf.us.ci/`
2. 填 `ACCESS_TOKEN`、GitHub 配置链接、机场订阅链接，点「保存」
3. 把页面给出的地址填进客户端：Clash 用 `/sub`，Stash 用 `/stash`，sing-box 用 `/singbox`

配置和订阅都存在 Worker 的 KV（`settings:global`），不写入 GitHub。改了 GitHub 上的分组或规则，Clash 下次刷新订阅就会用新版本（`profile-update-interval: 1`）。

如果 KV 里没有设置，`/sub` 会回退到 `CONFIG_URL`，`/provider` 会回退到 `SUBSCRIPTION_URL` secret。

## 接口

| 路径 | 说明 |
| --- | --- |
| `/` | 说明页 |
| `/health` | 健康检查 |
| `/api/profiles` | `POST {"url":"https://...","config":"https://...yaml"}`，带 token；`config` 可选，默认用 `CONFIG_URL` |
| `/api/profiles/<id>` | `DELETE`，带 token，删除订阅 |
| `/s/<id>` | 完整配置（节点走 `/provider/<id>`，规则走远程 mrs） |
| `/provider/<id>` | 节点列表（proxy-provider） |
| `/sub?token=` | 固定订阅模式的完整配置（Clash） |
| `/stash?token=` | Stash 兼容版（规则集转 yaml、展开个人规则） |
| `/singbox?token=` | sing-box 配置（JSON，只含出站侧） |
| `/provider?token=` | 固定订阅模式的节点列表 |

也支持 `Authorization: Bearer <token>`。

## KV

`/api/profiles` 生成的订阅存在 KV 命名空间 `PROFILES`（binding 已在 `wrangler.jsonc` 中配置），只保存订阅地址和创建时间，不保存解析后的节点。

`/provider/<id>` 不需要 token，id 本身就是凭证（32 位十六进制），不要公开。

## 注意

- `/provider` 返回节点凭据，不要把带 token 的地址公开。
- 改了 GitHub 模板后，下一次 `/sub` 请求就会使用新内容。
- 解析器支持 vmess / vless / trojan / ss / ssr / hysteria2 / tuic / socks5 / http；订阅可以是 Base64、明文链接或 Clash YAML。
- 解析器吐的是 Clash 节点结构，sing-box 侧再逐字段映射（见上文「sing-box 支持」）。

## 测试

```bash
npm test                     # 接口 + sing-box 映射（纯 Node，无需内核）
SINGBOX_CLI=/path/to/sing-box npm run test:e2e   # 用真内核校验 /singbox 的真实输出
```

`npm test` 目前含断言并在失败时非零退出：

- `test.mjs`：接口状态码、订阅内容、`/singbox` 结构（inbounds 已移除、urltest 填满、地区组挂进节点选择、无 token 401）
- `test-singbox.mjs`：各节点类型的字段映射，以及 ssr / 非法 reality key 必须被跳过

`test:e2e` 需要 `SINGBOX_CLI` 指向官方内核，它会跑完整 Worker 请求链，把 `/singbox` 的响应交给 `sing-box check`。
