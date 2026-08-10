# Reflow 本地 AI Gateway

该 Gateway 只用于本地开发阶段的一次 Proposal 请求：

```text
Web Capture → CloudProposalService → POST /v1/proposals
→ DeepSeek 官方 Responses API → CloudProposalDraft
```

它不保存数据库、会话、任务或 Capture 原文，也不执行任何 Reflow 领域 Action。

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

## 当前边界

这是 P1 本地开发 Gateway，不是 P2 公开服务。当前没有：

- 生产认证；
- Turnstile；
- 精确每日额度；
- 公网部署；
- 账号或数据库；
- 会话、队列、工具调用或 Agent Loop。

`AI_ENABLED=false` 可以独立关闭上游调用。公开部署前还需要单独完成来源白名单、防滥用、预算验证、隐私确认和运维流程。
