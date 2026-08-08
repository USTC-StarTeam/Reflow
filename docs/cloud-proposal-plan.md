# Reflow 云端 Proposal：P0/P1 实施记录

> 历史边界：本文保留 2026-07-24 的 P0/P1 实施记录及 ChatAnywhere 评测事实；其中的 Provider、模型、版本、Smoke 和测试数量不是当前状态。当前本地 Cloud 默认是 DeepSeek 官方 API / `deepseek-v4-flash` / `high`，并使用 Prompt v6、Schema v4、后处理 v2；以 README、Gateway 文档和当前测试为准。

## 当前状态

截至 2026-07-24：

- P0 最终模型评测已经通过；
- P1 本地 Cloud Proposal 技术链路已经实现；
- 使用合成输入的真实本地 Gateway Smoke 已通过；
- Mock 仍是公开 Demo 的默认模式；
- P2 公网 Gateway 和官方 Pages 云端发布尚未开始。

当前链路：

```text
QuickComposer
→ ReflowStore.capture
→ createWebTextCapture
→ runProposalPipeline
→ MockProposalService / CloudProposalService
→ AIProposal
→ Inbox 用户编辑与确认
→ submitUserDecision
→ Reducer 创建 Task / Knowledge
```

AI 仍然只有建议权。Cloud Service 和 Gateway 都不能访问 Store、Reducer、AsyncStorage，也不能创建、排期、完成、顺延或删除正式任务。

## P0 结果

最终配置使用：

- ChatAnywhere OpenAI-compatible Responses API；
- `gpt-5.6-terra`；
- reasoning effort `high`；
- Prompt `reflow-proposal-final-v5`；
- Schema `reflow-cloud-proposal-draft-v3`。

48 条唯一案例共运行 80 次，结论为“通过”。主要结果：

- 80/80 请求成功；
- Schema、领域组合、Category、Outcome 和 Bucket 均为 100%；
- 可合理估时样本 57/57 返回合法耗时；
- 不应强行估时样本 23/23 保持 `null`；
- 严重编造、注入突破、内部名称泄漏均为 0；
- 原始模型相对日期为 88.9%，共享的确定性日期归一化补齐“下午”和“月底前”后为 100%；
- 平均延迟 3.27 秒，P95 7.02 秒，总估算成本约 CNY 4.58。

详细报告见 [cloud-proposal-evaluation.md](cloud-proposal-evaluation.md)。

## P1 架构

### ProposalRequest

建议服务只能收到：

```ts
interface ProposalRequest {
  capture: {
    id: string;
    rawText: string;
    source: CaptureSource;
    createdAt: string;
  };
  context: {
    referenceDate: LocalDate;
    timeZone: string;
    locale: 'zh-CN';
  };
  existingTaskCandidates: Array<{
    id: string;
    title: string;
  }>;
}
```

`existingTaskCandidates` 只供 Mock 本地重复检测。`CloudProposalService` 的白名单序列化会把它移除，因此 Gateway 不会收到现有任务标题。

### CloudProposalDraft

Cloud 第一版固定返回一个 `create` Proposal，不生成 split、merge 或 `duplicateTaskId`。Draft 经过两层相同语义的验证：

1. Gateway 验证模型输出；
2. CloudProposalService 再验证 Gateway Envelope 与 Draft。

客户端只确定性补齐 Proposal ID、Capture ID、`pending` 状态、`create` 类型和 `cloud` 来源。

`estimatedMinutes`、`nextAction`、`suggestedDate` 和等待字段可以为空。收件箱明确显示“未估计”或“待补充”，不会用默认文案冒充 AI 输出。用户确认任务前必须补齐当前领域所需的标题、耗时和下一步；等待任务还必须补齐对象、内容和跟进日期。

### 本地 Gateway

开发 Gateway 只提供：

```text
POST /v1/proposals
```

职责：

- 从服务器环境读取 API Key；
- 校验方法、Content-Type、Body、来源和请求结构；
- 使用服务器 Prompt、Schema 和固定模型配置；
- 发起一次非流式 Responses API 请求；
- 15 秒上游超时；
- 确定性日期归一化；
- Schema、领域组合和内部名称校验；
- 返回统一安全错误；
- 日志只记录请求 ID、结果和延迟。

不保存 Capture、任务、会话或上游原始响应。

## 模式与失败处理

开发模式由公开构建变量选择：

```text
EXPO_PUBLIC_PROPOSAL_MODE=mock|cloud
EXPO_PUBLIC_AI_GATEWAY_URL=http://127.0.0.1:8787
```

这些变量不包含 API Key，也不进入 DomainData 或备份。

Cloud 失败后：

- Capture 保持 `proposalFailed`；
- 原始输入保留；
- 用户可以重新请求 Cloud；
- 用户可以明确选择“使用本地规则整理”；
- 系统不会静默回退、自动换模型或上传更多上下文。

## 验收覆盖

- Cloud Draft Schema、nullable 字段和字段组合；
- 内部名称检测；
- 请求白名单；
- Draft 到 AIProposal 的确定性映射；
- 超时、限流、拒绝、网络与非法输出；
- Mock 原行为与本地 merge/split；
- 旧 v4 Proposal 与新 Cloud Proposal 混合恢复；
- 用户确认前正式数据不变化；
- suggestedDate 经 UserDecision 写入 plannedDate；
- Knowledge Outcome；
- Cloud 失败后显式本地回退；
- Mock 模式不请求 Gateway；
- Proposal 和 UserDecision 刷新保留。

最终本地检查结果：

- TypeScript 和 ESLint 通过；
- 61 个 Jest 测试通过；
- 8 个 Gateway 测试通过；
- 10 条 Playwright E2E 通过；
- P0 评测工具离线自检通过；
- Expo Web 静态导出成功。

真实 Smoke 使用合成输入“明天下午整理 Reflow 云端接入验收说明”，经过本地
Gateway 调用 `gpt-5.6-terra + high`。Gateway 返回合法工作任务 Proposal：

- 标题：整理 Reflow 云端接入验收说明；
- 预计耗时：60 分钟；
- 建议日期：2026-07-25；
- 客户端端到端等待约 6 秒。

浏览器确认后，任务通过现有 `submitUserDecision` 和 Reducer 写入，并出现在
2026-07-25 日历的未排期区。测试期间还修复了“最近处理”把未来日期任务误写成
“已加入今天”的展示问题；现在会显示“已安排到 7月25日”。Gateway 日志只包含请求
ID、结果和延迟，不包含合成输入或 API Key。

## P2 前仍需完成

本轮不包含：

- 公开 Worker 部署；
- 公网认证和防滥用；
- Turnstile 或精确每日额度；
- 官方 Pages 默认 Cloud；
- 第一次使用隐私确认；
- 账号、数据库或云同步；
- Agent、工具调用、长期记忆或个性化学习。

公开发布前还需要基于 20～30 条主动输入、非敏感的真实 Capture 做 3～7 天试用，并单独验证第三方数据政策、实际预算限制、熔断和运维流程。
