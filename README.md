# Reflow

Reflow 是一个移动优先的个人执行管理 Demo。它的目标不是再提供一个待办清单，而是把零散输入变成可以立刻开始的下一步行动，并让执行过程自然沉淀为回顾。

当前 v4 聚焦一条可在浏览器本地完整使用和追踪的闭环：

```text
捕捉事项 → 生成 Proposal → 人工确认 → 选择计划日期
→ 点击安排时间 → 冲突确认 → 执行记录 → 完成 / 顺延 → 历史回顾
```

> 当前是本地优先的时间规划 MVP：不接真实 AI、后端、账号、云同步或第三方服务，也不会自动修改用户日程。

- 在线 Demo：[https://lsclin.github.io/Reflow/](https://lsclin.github.io/Reflow/)
- 当前开发分支：[lsclin/Reflow · lsc](https://github.com/lsclin/Reflow/tree/lsc)

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

## 当前状态（v4）

- 已完成：五页应用、显式 Pipeline、九种用户可见分类、`plannedDate` 日期归属、不可变 `TaskPlanEvent`、点击排期、冲突确认、日/周时间网格、顺延历史、重叠耗时统计、本地备份恢复和确定性回顾。
- 已验证：TypeScript、ESLint、44 个单元测试和 6 条 Playwright E2E；测试覆盖捕捉执行闭环、收件箱、计划与实际日历、点击排期冲突、备份恢复及顺延历史。
- 自动化：`lsc` 每次 push 都会运行 CI 并部署 GitHub Pages；仓库中的 v4 修改在推送后进入线上版本。
- 当前定位：这是可试用的本地个人时间规划 MVP。课程表、外部日历、云同步和 Agent 能力尚未进入范围。

最初的里程碑与验收清单见 [docs/implementation-plan.md](docs/implementation-plan.md)。

## 页面与体验

| 路由 | 页面 | 用途 |
| --- | --- | --- |
| `/` | 今天 | 快速捕捉，按“已排期 / 未排期 / 已完成”查看当天任务，并把旧任务明确加入今天。 |
| `/inbox` | 收件箱 | 在“待你确认 / 最近处理”中理解并编辑 Proposal，选择任务去向或知识产物，并撤销最近一次安全可逆决定。 |
| `/active` | 进行中 | 管理唯一的当前执行任务，记录进展、耗时、打断、暂停或完成。 |
| `/calendar` | 日历 | 月视图与日/周时间网格；点击安排或调整时间，冲突必须显式确认，未排期任务可采用本地规则建议。 |
| `/review` | 回顾 | 从计划事件、完成时间、实际重叠耗时和打断记录派生按计划完成、额外完成、未完成与顺延结果。 |

桌面浏览器中应用内容会居中为单栏；手机浏览器中会铺满屏幕。左上角品牌入口包含“重置 Demo 数据”。

## 领域模型与规则

Reflow 明确区分“事项属于什么”和“事项现在在哪里”，避免将工作流状态混进内容分类。

| 维度 | 含义 |
| --- | --- |
| `TaskCategory` | 工作推进、沟通跟进、学习研究、生活事务、健康、未识别。 |
| `TaskStatus` | 未开始、进行中、已完成。 |
| `WorkflowBucket` | 收件箱、今天、等待他人、稍后处理、归档。 |
| `CaptureOutcome` | 任务、知识沉淀、忽略。 |

用户界面不会暴露这些内部维度，而是统一呈现九种“AI 归类结果”：工作推进、沟通跟进、学习研究、生活事务、健康、等待他人、稍后处理、知识沉淀、未识别。等待他人、稍后处理和知识沉淀在底层仍分别映射到工作流去向或产物类型。

主要事实对象是 `InboxCapture`、`AIProposal`、`UserDecision`、`TaskItem`、`TaskPlanEvent`、`KnowledgeCard`、`TimeEntry` 和 `ProgressLog`。`UserDecision` 会保存用户编辑内容、工作流去向、最终产物与可逆效果；刷新后最近一次未撤销决策仍可追踪和撤销。回顾结果不是持久化事实，而是根据这些事实实时派生。

`TaskItem.plannedDate` 是当前日期归属的唯一事实源；`bucket=today` 仅为旧数据兼容，页面和统计不会用它判断“今天”。具体时间使用带时区的 ISO 值，计划时间块不得跨自然日。

领域层使用明确动作：`planTaskForDate`、`scheduleTask`、`unscheduleTask`、`deferTask`、`startTask`、`pauseTask`、`completeTask`、`recordTime`、`recordProgress`、`recordInterruption` 和 `deleteTask`。每次计划变化都会原子更新当前任务并追加不可变计划事件；同一时刻最多只有一个进行中任务。

`MockProposalService` 使用固定关键词、拆分规则和重复事项识别生成建议；相同输入会获得相同结果，不使用随机数，也不声称是实际 AI。

日历内容同样只做确定性派生：有完整时间的任务显示为计划时间块；只有 `plannedDate`、没有具体时间的任务显示为未排期；完成任务按 `completedAt` 出现在实际完成日。计划日和完成日不一致时两天都会保留记录，同一天按任务去重。冲突采用 `[startAt, endAt)`，首尾相接不冲突。

## 技术方案

- **应用框架**：Expo SDK 57、React 19、React Native 0.86、TypeScript。
- **路由与 Web**：Expo Router + React Native Web；静态导出由 Metro 完成。
- **状态管理**：React Context + Reducer，跨页面共享领域状态。
- **持久化**：`@react-native-async-storage/async-storage`，主键继续为 `reflow.demo.v1`，领域版本为 v4；可迁移 v1–v3，并保存 last-known-good 恢复副本。
- **排期**：点击排期为跨端必须路径；Web 拖拽排期仍是后续增强项。
- **测试**：Jest + jest-expo 覆盖日期工具、Pipeline、Reducer、计划事件、Selector、回顾、迁移和备份校验；Playwright 覆盖六条核心用户流程。

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
2. 在“今天”输入一个新事项，例如“推进季度复盘材料”。
3. 进入“收件箱”，确认整理结果和理由，再点击“确认并加入今天”。
4. 在“今天”找到未排期任务，点击“安排时间”。
5. 选择日期、开始时间和时长；如发生冲突，确认系统没有自动改动其他任务，再选择取消或“仍然安排”。
6. 开始任务，在“进行中”记录进展、耗时和打断，然后完成。
7. 打开“日历”，确认计划时间与实际完成正确显示。
8. 打开“回顾”，确认原计划、按计划完成、额外完成、未完成与实际耗时更新；也可把未完成任务顺延到明天或稍后。
9. 刷新页面，确认任务、计划事件和历史回顾保留。
10. 在设置中导出备份；导入时先检查预览数量，再确认整体替换。

## 检查、测试与导出

```bash
# TypeScript 类型检查
npm run typecheck

# ESLint
npm run lint

# 44 个单元测试：日期、Pipeline、Reducer、计划事件、Selector、统计、迁移与备份
npm test

# 6 条端到端流程：核心闭环、收件箱、日历、点击排期、备份与顺延历史
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

- 数据只保存在当前设备，不会上传到服务器；应用没有账号、遥测或第三方业务请求。
- 持久化内容仅包含领域数据：任务、捕捉及其 Pipeline 状态、Proposal、决策、计划事件、耗时、进展和知识卡片。
- 弹窗开关、loading、toast、当前 Tab 等瞬时 UI 状态不会保存。
- 数据损坏时优先读取最后一个合法恢复副本，再回退到种子数据。
- 设置页支持导出和导入带版本的 JSON 备份。导入会校验结构、ID、引用和时间字段；验证失败不会修改主数据或恢复副本。
- 浏览器存储和导出的备份均不加密，请自行妥善保管备份文件。
- 可从左上角品牌入口使用“重置 Demo 数据”恢复初始演示状态。

## 协作约定

- 所有第一版开发都在 `lsc` 分支进行，不重写 `main` 历史，也不 force push。
- 当前上游仓库使用 Fork + Draft PR 协作方式；提交前应依次执行类型检查、lint、测试和静态导出。
- 新功能优先保障核心闭环，不让拖拽、复杂日/周视图、部署细节或额外动画阻塞主要体验。

## 首版范围外

当前版本暂不包括登录、云同步、真实 AI、邮件/飞书接入、课程表、系统日历、通知、语音识别、周期任务、项目/标签、Time Slot、Web 拖拽排期、多人协作和原生安装包发布。这些能力应在本地时间规划闭环稳定后逐步接入。
