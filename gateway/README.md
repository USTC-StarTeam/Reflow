# Reflow Local Service

该本地进程组合两个彼此隔离的 request-driven 边界：

```text
Local Service
├─ existing AI Gateway       → GET /health, POST /v1/proposals
└─ Message Gateway V0        → GET /v1/messaging/*
```

现有 AI Gateway 用于本地开发阶段的一次 Proposal 请求：

```text
Web Capture → CloudProposalService → POST /v1/proposals
→ DeepSeek 官方 Responses API → CloudProposalDraft
```

Local Service 不保存数据库、会话、任务或 Capture 原文，也不执行任何 Reflow 领域 Action。

Message Gateway 当前只包含 deterministic `fake-email` Queryable Connector，用来验证 provider-neutral 的 `ExternalItem` 边界；它不接真实邮箱，也不创建 Capture。

## 配置

复制示例文件：

```powershell
Copy-Item gateway/.dev.vars.example gateway/.dev.vars
```

然后只在被 Git 忽略的 `gateway/.dev.vars` 中填写：

```text
DEEPSEEK_API_KEY=本机密钥
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-v4-flash
DEEPSEEK_REASONING_EFFORT=high
```

也可以直接使用当前终端环境变量。`DEEPSEEK_RESPONSES_URL` 可在代理或兼容层场景下直接覆盖 `/responses` 地址；普通官方配置不需要设置。

只要存在任一 `DEEPSEEK_*` 变量，Gateway 就使用完整的 DeepSeek 配置命名空间，缺少的 Base URL、模型和推理强度回到上面的 DeepSeek 安全默认，不会混入机器上遗留的 `OPENAI_*` 用户环境变量。完全没有 `DEEPSEEK_*` 时，旧的 `OPENAI_API_KEY`、`OPENAI_BASE_URL` / `OPENAI_API_BASE`、`OPENAI_RESPONSES_URL`、`OPENAI_MODEL` 和 `OPENAI_REASONING_EFFORT` 仍兼容；该旧命名空间缺项时继续使用历史默认 `https://api.chatanywhere.tech/v1`、`gpt-5.6-terra` 和 `high`，绝不会把旧 Key 发往 DeepSeek。

DeepSeek 官方 [Responses API 指南](https://api-docs.deepseek.com/guides/responses_api/) 当前只支持 `deepseek-v4-flash`。不要再配置已经退役的 `deepseek-chat` 或 `deepseek-reasoner`；本轮也不切换到 Chat Completions。

不要把密钥放入：

- `EXPO_PUBLIC_*`；
- React Native / Web 源码；
- Git；
- 浏览器存储；
- Issue、日志或聊天记录。

## 启动

终端一：

```powershell
npm run gateway
```

默认监听：

```text
http://127.0.0.1:8787
```

健康检查：

```powershell
Invoke-RestMethod http://127.0.0.1:8787/health
```

终端二：

```powershell
$env:EXPO_PUBLIC_PROPOSAL_MODE = 'cloud'
$env:EXPO_PUBLIC_AI_GATEWAY_URL = 'http://127.0.0.1:8787'
npm run web
```

恢复本地规则：

```powershell
$env:EXPO_PUBLIC_PROPOSAL_MODE = 'mock'
npm run web
```

## 请求边界

前端只发送：

- 当前 Capture 的 `rawText` 和 `source`；
- `referenceDate`；
- IANA `timeZone`；
- `locale = zh-CN`。

前端不会发送任务列表、状态、计划日期、时间块、执行日志、知识卡片、决策历史、回顾或备份。

Gateway 使用服务器控制的 Prompt 和 JSON Schema，执行一次非流式 Responses API 请求，经过确定性日期归一化、Schema 校验和领域组合校验后才返回 Draft。模型拒绝、超时、限流、网络失败和非法输出都映射成安全错误，不返回上游原始错误。

请求继续使用 `developer` 输入、严格 `text.format` JSON Schema、`max_output_tokens` 和 `store: false`，不传工具。DeepSeek 将 `developer` 作为 system 处理，完整支持 `text.format`；其 Responses API 是无状态的，`store` 不受支持但会被忽略，响应保持 `store: false`。Gateway 仍会对输出做本地严格验证，不会为缺失字段填默认值。

### 上游错误映射

Gateway 不返回 DeepSeek 的响应正文，只使用 HTTP 状态生成现有领域合同能表达的安全错误：

| DeepSeek 状态 | Gateway 错误 | 是否可重试 |
| --- | --- | --- |
| `400` 格式错误、`422` 参数错误 | `invalid_proposal` | 否；检查本地请求/模型配置 |
| `401` 认证失败、`402` 余额不足、`403` 无权限、`404` 模型或接口不存在 | `proposal_unavailable` | 否；修正 Key、余额或配置 |
| `429` 限流 | `proposal_rate_limited` | 是 |
| `408` / `504` 超时 | `proposal_timeout` | 是 |
| `500` / `502` / `503` 服务异常 | `proposal_unavailable` | 是 |

Cloud 失败后仍只保留失败的 Capture，由用户决定重试或显式改用本地规则；不会静默 Mock。

### 本地脱敏诊断

Cloud Proposal 校验失败时，可以仅在本机临时启用：

```text
GATEWAY_DIAGNOSTICS_ENABLED=true
```

该开关默认关闭，且只接受 `true`、`1`、`on` 或 `yes`（忽略大小写和首尾空格）作为启用值；`false`、`0`、`off`、`no`、空值、未设置及任何未知或拼错值都会保持关闭。启用后，Gateway 日志最多记录失败阶段、分类、JSON 字段路径、静态规则代码和预期约束。它不记录 Capture 原文、字段实际值、完整模型响应、API Key、认证头或系统 Prompt；浏览器仍只收到原有通用安全错误。定位完成后应立即恢复为 `false`。

## 测试

```powershell
npm run test:gateway
```

测试不会调用真实模型。真实 Smoke Test 只能使用合成、非敏感输入，并且不应进入公开 CI。

## Message Gateway V0

Message Gateway 是 local、provider-neutral、默认只读的外部输入边界：

```text
External World → Queryable Connector → Message Gateway → ExternalItem
```

V0 只接受 `mode = queryable`。`probe`、`listItems` 和 `getItem` 是基础 contract；`search`、`pagination` 等可选行为通过 descriptor 的 `capabilities` 声明。Registry 在构造时校验 connector 与唯一 id，构造后不支持动态增删。

可用接口：

```text
GET /v1/messaging/connectors
GET /v1/messaging/connectors/:connectorId/health?accountId=...
GET /v1/messaging/items?connectorId=...&accountId=...&limit=...&cursor=...&query=...
GET /v1/messaging/items/detail?connectorId=...&accountId=...&externalId=...
```

`limit` 默认为 `20`，最大为 `100`；`cursor` 与 `externalId` 都是 opaque string。Fake Connector 固定使用：

```text
connectorId = fake-email
source      = email
provider    = fake
accountId   = fake-account
```

所有 Messaging 成功响应包含 `status = success` 和 `schemaVersion = 1`。失败响应使用统一安全 envelope：

```json
{
  "status": "failure",
  "error": {
    "code": "provider_error",
    "message": "外部服务返回了无效结果。",
    "retryable": false
  }
}
```

主要错误映射：

| code | HTTP | retryable |
| --- | ---: | ---: |
| `invalid_request` | 400 | false |
| `unsupported_capability` | 400 | false |
| `unknown_connector` | 404 | false |
| `account_not_found` | 404 | false |
| `item_not_found` | 404 | false |
| `provider_auth_error` | 502 | false |
| `provider_error` | 502 | false |
| `network_error` | 503 | true |
| `messaging_unavailable` | 500 | true |

Gateway 会严格校验 Connector 输出及 `source`、`provider`、`accountId`、detail `externalId` 的请求绑定。Summary 出现 `content` 或任何未知字段会使整个请求以 `provider_error` 失败，而不是静默删除字段。所有 ExternalItem 的 `trust` 固定为 `untrustedExternal`。

`providerHints` 仅接受 Connector 明确白名单中的有界 scalar 或小型字符串数组；未知 key、嵌套对象、binary、超长值和明显敏感 key 会被拒绝。敏感 key 检查只是 defense-in-depth，不是通用 secret detection。

Foundation 保证的是 Gateway 的 Summary HTTP 响应不含正文。它不能证明未来真实 Connector 内部没有提前获取正文；真实 IMAP Connector 必须另行加入 provider-specific metadata/detail fetch 测试。

## 当前边界

这是本地开发服务，不是公开 Gateway。当前没有：

- 生产认证；
- Turnstile；
- 精确每日额度；
- 公网部署；
- 账号或数据库；
- 会话、队列、工具调用或 Agent Loop。
- 真实 Email Provider、账户或 credential persistence；
- polling、IMAP IDLE、webhook、后台同步或 Event Source；
- `ExternalItem → Capture` 或任何 Domain 写入。

`AI_ENABLED=false` 可以独立关闭上游调用。公开部署前还需要单独完成来源白名单、防滥用、预算验证、隐私确认和运维流程。
