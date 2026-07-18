# Reflow

Reflow 是一个移动优先的个人执行管理 Demo。它的目标不是再提供一个待办清单，而是把零散输入变成可以立刻开始的下一步行动，并让执行过程自然沉淀为回顾。

首版聚焦一条可在浏览器本地完整演示的闭环：

```text
捕捉事项 → 生成 Proposal → 编辑并接受 → 加入今天
→ 开始执行 → 记录耗时 / 进展 / 打断 → 完成 → 回顾更新 → 刷新后保留
```

> 当前是验证产品形态与交互的本地 Demo：不接真实 AI、后端、账号、云同步或第三方服务。

## 显式 Pipeline 架构（非 Agent）

Reflow 第一版采用固定、可测试的 Pipeline，而不是通用 Agent：

```text
Capture → ProposalService → AIProposal → UserDecision
→ Task / Knowledge Outcome → Execution Logs → Deterministic Review
```

| 节点 | 输入 | 输出 | 失败与写入边界 |
| --- | --- | --- | --- |
| Capture Factory | Web 文本与来源元数据 | `InboxCapture` | 空文本返回结构化校验失败；当前实现 `webText`，模型已预留语音、邮件、飞书、日历、分享扩展和移动端快捷入口。 |
| ProposalService | `ProposalRequest` | `ProposalResult`（Proposal 集合或 `ProposalFailure`） | 失败可重试；Service 只能读取请求，不能访问 Store、Reducer、AsyncStorage 或任务数据写入接口。 |
| UserDecision | 待确认 Proposal 与用户编辑 | 持久化 `UserDecision` | 只有领域 Reducer 能创建、合并、拆分任务或创建知识卡片；忽略只拒绝 Proposal。 |
| Execution Logs | 明确领域动作 | 任务状态、`TimeEntry`、`ProgressLog` | 缺失任务、非法耗时、非法排期会返回结构化失败且不写入事实数据。 |
| Deterministic Review | 任务与执行事实 | `ReviewFacts` / `ReviewSummary` | 指标由程序计算；未来模型最多解释已计算事实，不能计算或覆盖关键指标。 |

`MockProposalService` 是可注入的默认 Provider。未来接入 OpenAI 或 Claude 时，只需要实现同一个 `ProposalService` 接口；UI、Store 和执行领域动作不需要改写。

这意味着首版**不实现** ReAct 循环、自主工具选择、多 Agent、长期自主运行或通用 Agent Runtime。重点是让每个步骤可靠、可追踪、可撤销。

## 当前状态

- 已完成：五页 Web Demo、核心闭环、显式 Pipeline、确定性 Mock Proposal、可撤销决策事件、月历排期与派生回顾。
- 已验证：类型检查、lint、20 个单测、完整 Playwright 核心流程 E2E，以及普通与 Pages base path 两种静态导出。
- 自动化：`lsc` 的 GitHub Actions 已执行 CI 与 GitHub Pages 部署；在线 Demo 见 [lsclin.github.io/Reflow](https://lsclin.github.io/Reflow/)。

详细的里程碑与验收清单见 [docs/implementation-plan.md](docs/implementation-plan.md)。

## 页面与体验

| 路由 | 页面 | 用途 |
| --- | --- | --- |
| `/` | 今天 | 快速捕捉、查看今日重点、开始/完成任务与调整顺序。 |
| `/inbox` | 收件箱 | 查看并编辑 Proposal，选择加入今天、等待他人、稍后处理或忽略；支持撤销最近一次决定。 |
| `/active` | 进行中 | 管理唯一的当前执行任务，记录进展、耗时、打断、暂停或完成。 |
| `/calendar` | 日历 | 以月视图为主，选择日期查看任务，并接受空档建议完成排期。 |
| `/review` | 回顾 | 按日、周、月从实际任务与日志派生完成数、耗时、打断和分类分布。 |

桌面浏览器中应用内容会居中为单栏；手机浏览器中会铺满屏幕。左上角品牌入口包含“重置 Demo 数据”。

## 领域模型与规则

Reflow 明确区分“事项属于什么”和“事项现在在哪里”，避免将工作流状态混进内容分类。

| 维度 | 含义 |
| --- | --- |
| `TaskCategory` | 工作推进、沟通跟进、学习研究、生活事务、健康、未识别。 |
| `TaskStatus` | 未开始、进行中、已完成。 |
| `WorkflowBucket` | 收件箱、今天、等待他人、稍后处理、归档。 |
| `CaptureOutcome` | 任务、知识沉淀、忽略。 |

主要事实对象是 `InboxCapture`、`AIProposal`、`UserDecision`、`TaskItem`、`KnowledgeCard`、`TimeEntry` 和 `ProgressLog`。`UserDecision` 会保存用户编辑内容、工作流去向、最终产物与可逆效果；刷新后最近一次未撤销决策仍可追踪和撤销。回顾结果不是持久化事实，而是根据任务和执行日志实时派生。

领域层使用明确动作：`startTask`、`pauseTask`、`completeTask`、`moveTask`、`recordTime`、`recordProgress`、`recordInterruption`、`scheduleTask` 和 `deleteTask`。同一时刻最多只能有一个进行中任务。

`MockProposalService` 使用固定关键词、拆分规则和重复事项识别生成建议；相同输入会获得相同结果，不使用随机数，也不声称是实际 AI。

## 技术方案

- **应用框架**：Expo SDK 57、React 19、React Native 0.86、TypeScript。
- **路由与 Web**：Expo Router + React Native Web；静态导出由 Metro 完成。
- **状态管理**：React Context + Reducer，跨页面共享领域状态。
- **持久化**：`@react-native-async-storage/async-storage`，浏览器键保持为 `reflow.demo.v1`，领域数据版本为 v2，并自动迁移 v1 数据。
- **排序**：Web 优先使用 `@dnd-kit`；非 Web 端保留上移/下移 fallback。
- **测试**：Jest + jest-expo；Playwright 已配置为后续核心流程 E2E 的入口。

项目目录：

```text
src/
  app/       Expo Router 路由与应用根布局
  core/      Capture Factory、Pipeline、类型、Mock Proposal、Reducer、Selector、持久化与 Store
  features/  各页面及跨端共享 UI 组件
docs/        产品执行清单与后续里程碑
```

## 本地启动

前置条件：已安装 Node.js 与 npm。可用下面命令确认环境：

```bash
node --version
npm --version
```

安装依赖并启动 Web 开发服务器：

```bash
npm install
npm run web
```

终端会显示访问地址，通常为 `http://localhost:8081`。也可以运行：

```bash
npm start
npm run android
npm run ios
```

首版以 Web 为验收目标；Android/iOS 命令用于验证共享路由与组件的后续复用能力。

## 建议的手动验收流程

1. 打开左上角品牌入口，点击“重置 Demo 数据”。
2. 在“今天”输入一个新事项，例如“整理季度复盘材料”。
3. 进入“收件箱”，编辑 Proposal 后点击“加入今天”。
4. 返回“今天”并开始该任务。
5. 在“进行中”记录一句进展、补记 15 分钟，然后完成任务。
6. 打开“回顾”，确认完成数和实际耗时已更新。
7. 刷新页面，确认数据仍保留。
8. 在“日历”选择日期并接受空档建议，确认任务计划时间已更新。

## 检查、测试与导出

```bash
# TypeScript 类型检查
npm run typecheck

# ESLint
npm run lint

# 单元测试：Capture Factory、Pipeline、Mock Proposal、Reducer、统计与持久化
npm test

# 一条端到端核心闭环（会自动启动或复用 Web 开发服务器）
npm run test:e2e

# 静态 Web 导出，产物位于 dist/
npm run export:web
```

GitHub Pages 构建时需要带仓库前缀：

```bash
$env:GITHUB_PAGES = 'true'
npm run export:web
```

PowerShell 中可用下列命令预览导出产物：

```powershell
python -m http.server 4173 -d dist
```

然后访问 `http://localhost:4173`。首次运行 Playwright 时，如本机尚无浏览器运行时，执行 `npx playwright install chromium`。

推送到 `lsc` 会自动运行类型检查、lint、Jest、核心 E2E 和静态导出；随后以 `GITHUB_PAGES=true` 导出并部署到 Pages。fork 的 `github-pages` 环境已允许 `lsc` 发布；合并到上游后，应把部署触发分支切换为 `main`。

## 数据、隐私与重置

- Demo 数据只保存在当前浏览器，不会上传到服务器。
- 持久化内容仅包含领域数据：任务、捕捉及其 Pipeline 状态、Proposal、决策事件、耗时、进展和知识卡片。
- 弹窗开关、loading、toast、当前 Tab 等瞬时 UI 状态不会保存。
- 数据版本或内容损坏时会自动回退到种子数据。
- 可从左上角品牌入口使用“重置 Demo 数据”恢复初始演示状态。

## 协作约定

- 所有第一版开发都在 `lsc` 分支进行，不重写 `main` 历史，也不 force push。
- 当前上游仓库使用 Fork + Draft PR 协作方式；提交前应依次执行类型检查、lint、测试和静态导出。
- 新功能优先保障核心闭环，不让拖拽、复杂日/周视图、部署细节或额外动画阻塞主要体验。

## 首版范围外

首版暂不包括登录、云同步、真实 AI、邮件/飞书接入、系统日历、通知、语音识别、多人协作和原生安装包发布。这些能力应在核心闭环稳定后逐步接入。
