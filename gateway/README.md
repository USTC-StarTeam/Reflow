# Reflow 本地 AI Gateway

该 Gateway 只用于本地开发阶段的一次 Proposal 请求：

```text
Web Capture → CloudProposalService → POST /v1/proposals
→ ChatAnywhere Responses API → CloudProposalDraft
```

它不保存数据库、会话、任务或 Capture 原文，也不执行任何 Reflow 领域 Action。

## 配置

复制示例文件：

```powershell
Copy-Item gateway/.dev.vars.example gateway/.dev.vars
```

然后只在被 Git 忽略的 `gateway/.dev.vars` 中填写：

```text
OPENAI_API_KEY=本机密钥
OPENAI_BASE_URL=https://api.chatanywhere.tech/v1
OPENAI_MODEL=gpt-5.6-terra
OPENAI_REASONING_EFFORT=high
```

也可以直接使用当前终端环境变量。不要把密钥放入：

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
