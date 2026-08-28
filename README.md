# Reflow

Reflow 是一个本地优先、移动优先的个人执行与时间规划 MVP。它尝试把零散输入整理成可确认的行动，再连接计划日期、时间安排、执行记录和回顾，减少“记下了，但没有真正推进”的情况。

当前版本以 Web 为主要验收平台，桌面浏览器和手机浏览器都可以直接使用。项目保留 Expo / React Native 的跨端结构，但暂未发布原生安装包。

- 在线 Demo：[https://ustc-starteam.github.io/Reflow/](https://ustc-starteam.github.io/Reflow/)
- 稳定版本分支：[USTC-StarTeam/Reflow · main](https://github.com/USTC-StarTeam/Reflow/tree/main)
- 当前产品版本：V1，本地时间规划 MVP

> 当前开发环境已支持通过本地 Gateway 调用真实云端模型生成 Proposal，并按用户操作只读访问中科大邮箱；公开在线 Demo 仍默认使用确定性的本地规则，也不会访问用户邮箱。账号、云同步和其他外部平台接入尚未实现。

## 当前版本能做什么

Reflow V1 已经打通下面这条可实际操作、可刷新恢复的闭环：

```text
Capture → Proposal → UserDecision → Task / Knowledge
→ Planning → Execution → Review
```

主要能力包括：

- 从“今天”快速捕捉一条文本事项；
- 从收件箱按需查看中科大邮箱最近邮件，并由用户明确选择是否加入现有 Capture / Proposal 流程；
- 在收件箱中查看、修改和确认整理建议；
- 将内容保存为任务或本地知识卡片；
- 为任务选择日期并安排具体时间；
- 检测时间冲突，只有用户明确确认后才允许重叠安排；
- 开始、暂停和完成任务，记录进展与执行时长；
- 将未完成任务顺延到其他日期或移到稍后；
- 从计划历史与执行事实派生日历和确定性回顾事实；
- 在回顾页查看今天、本周和本月的确定性事实、待处理事项、异常执行记录核对与知识卡片；
- 刷新后恢复数据，导出、校验并导入本地备份。

## 页面说明

| 路由 | 页面 | 当前用途 |
| --- | --- | --- |
| `/` | 今天 | 快速捕捉和扫描今日重点；按时间安排、当天事项和已完成分区展示，简单任务可一键完成，复杂任务从 Detail 继续处理。 |
| `/inbox` | 收件箱 | 快速确认 AI / 本地规则整理后的建议；必要时补充日期或修改内容，失败输入可重试或改用本地规则，最近决定可撤销。 |
| `/active` | 进行中 | 围绕唯一当前任务记录进展、暂停或完成，并显示轻量执行摘要；没有当前任务时只保留少量可开始或继续的候选。 |
| `/calendar` | 日历 | 时间规划空间：Month 查看整体分布，Week 查看一周负载，Day 安排具体时间；明确区分当天事项与具体时间块。 |
| `/review` | 回顾 | 在今天、本周和本月三个周期查看确定性计划与执行事实；同时提供待处理事项、异常执行记录核对和知识沉淀入口。 |

Review 的日 / 周 / 月数据都由任务、计划事件、TimeEntry 和中断记录确定性派生。当前尚未实现长期 AI Pattern、Personalized Review 或自动生成的个人模式。

桌面端的普通页面保持居中单栏，日历使用更宽的布局；手机端铺满屏幕，Day 视图提供具体时间规划网格，Week 视图以一周负载和日期分布为主。

### “保存为知识”是什么

收件箱中的“保存为知识”用于保存不需要执行、但以后可能复用的信息，例如经验、结论或资料摘要。

```text
“今晚整理比赛报名材料” → 更适合作为任务
“比赛报名需要身份证、学生证和指导老师签字” → 更适合作为知识
```

正式知识只能经过下面的确认路径创建：

```text
AI Proposal → UserDecision → KnowledgeCard
```

保存后会生成一个本地 `KnowledgeCard`：

- 不进入“今天”和日历；
- 没有开始、完成或排期状态；
- “回顾”一级页只显示“知识沉淀”入口和当前已保存数量，不直接展开知识卡内容；
- 会随本地数据一起持久化和备份。

AI 不会绕过用户确认自动写入知识。当前还没有独立的知识库页面，也不支持知识搜索、标签和引用，因此这部分仍是基础演示形态。

## 架构

Reflow 当前采用显式、可测试的 Pipeline，而不是通用 Agent：

```text
External Input
├─ Manual Text
└─ USTC Email（本地 Gateway，只读、按需加入）
       ↓
Capture → ProposalService → AIProposal → UserDecision
→ Task / Knowledge → Planning → Execution → Deterministic Review
```

每一层都有清晰的写入边界：

- `Capture Factory` 将不同来源的输入统一转换为 `InboxCapture`；
- `ProposalService` 只能读取请求并返回结构化 Proposal，不能访问 Store、Reducer 或持久化层；
- 用户确认后，只有领域 Reducer 可以创建任务、合并或拆分任务、保存知识以及记录忽略结果；
- 排期、状态、耗时、进展和删除必须通过明确的领域 Action 写入；
- 回顾中的关键数字由程序根据事实确定性计算，模型不能生成或覆盖这些指标。

`ProposalService` 当前有两个实现：

- `MockProposalService`：确定性的本地规则，也是公开 Demo 和普通本地启动的默认实现；
- `CloudProposalService`：通过本地 Gateway 调用真实云端模型，并把严格校验后的 Draft 映射为同一种 `AIProposal`。

Cloud 模式仍然复用相同的 Inbox、UserDecision、Reducer 和任务执行逻辑，不会让模型越过用户确认边界。

本地 Gateway 当前承担两个彼此受限的职责：转发 Cloud Proposal 请求，以及通过只读 IMAP 按用户操作读取中科大邮箱。邮件只有在用户点击“加入 Reflow”后才会成为 Capture；Gateway 不做后台监听、自动同步、回复、移动或删除邮件。

Gateway 的 tracked 默认配置仍是 DeepSeek 官方 Responses API、`deepseek-v4-flash`、`high` 推理强度；同时保留 `OPENAI_*` 兼容配置。当前合同使用 Prompt `reflow-proposal-conservative-v7`、Schema `reflow-cloud-proposal-draft-v4` 和后处理 `reflow-proposal-conservative-normalizer-v3`。2026-08-09 使用当时的 v6/v4/v2 合同和被 Git 忽略的本地配置完成了 ChatAnywhere / `gpt-5.6-terra` / `high` 六条 Web Smoke，结果为 6/6 成功、0 timeout；这不会改变公开 Demo 默认使用 Mock，也不会把本地 Provider 配置写入仓库。

当前版本不包含 ReAct 循环、自主工具选择、多 Agent、长期自主运行或通用 Agent Runtime。

## 时间规划与历史回顾

`TaskItem.plannedDate` 是任务当前日期归属的唯一事实源。旧的 `bucket=today` 只保留用于历史数据迁移，不参与当前页面和统计判断。

具体时间使用带时区偏移的 ISO 时间。计划开始和结束时间必须：

- 同时存在或同时为空；
- 开始时间早于结束时间；
- 与 `plannedDate` 属于同一个本地自然日；
- 不允许单个计划时间块跨自然日。

时间冲突使用半开区间 `[startAt, endAt)`，所以两个首尾相接的任务不冲突。系统不会自动挪动其他任务，冲突时必须由用户选择取消或“仍然安排”。

每次计划变化都会原子更新任务的当前计划，并追加不可变的 `TaskPlanEvent`。事件覆盖加入计划、安排时间、重新排期、取消排期、顺延、移到稍后和取消等变化。

确定性 Review Kernel 会从任务、计划事件、完成时间、耗时记录和打断记录派生：

- 当日原计划任务数；
- 按计划完成数；
- 当日完成总数；
- 额外完成数；
- 未完成数；
- 计划完成率；
- 顺延或移到稍后的结果；
- 实际投入时间和打断次数。

这些事实直接支持当前 Review 的今天 / 本周 / 本月视图；周期回顾展示计划任务、按计划完成、完成率、实际投入、中断次数和主要投入分类。Review 不承担重新规划，也尚未实现长期 AI Pattern 或 Personalized Review。

任务被顺延后，原日期仍会在确定性事实中保留历史结果。任务以后完成，也不会反向改写原日期的计划完成率。跨午夜的 `TimeEntry` 会按照与两个自然日的实际重叠时间分别统计。

## 技术栈

- Expo SDK 57
- React 19 / React Native 0.86
- TypeScript
- Expo Router
- React Native Web
- React Context + Reducer
- AsyncStorage
- Jest + jest-expo
- Playwright
- GitHub Actions + GitHub Pages

项目结构：

```text
src/
  app/       Expo Router 路由和应用根布局
  core/      Pipeline、领域类型、Reducer、Selector、持久化和 Store
  features/  今天、收件箱、进行中、日历、回顾及共享 UI
docs/        实施清单和领域约束
e2e/         Web 核心流程验收
gateway/     本地 Cloud Proposal 与中科大邮箱只读 Gateway
tools/       云端 Proposal 模型评测工具
```

## 本地运行

需要 Node.js 和 npm。仓库 CI 当前使用 Node.js 22。

```bash
npm install
npm run web
```

Expo 启动后会显示访问地址，通常是：

```text
http://localhost:8081
```

其他可用命令：

```bash
npm start
npm run android
npm run ios
```

Android 和 iOS 命令目前主要用于验证共享路由与组件的可复用性，首版仍以 Web 为主要验收目标。

### 本地使用真实云端 Proposal

Cloud 模式需要同时运行本地 Gateway 和 Expo Web。模型 API Key 只配置在 Gateway 进程中，不能使用 `EXPO_PUBLIC_*` 变量，也不能写入前端源码。

首先复制本地变量示例：

```powershell
Copy-Item gateway/.dev.vars.example gateway/.dev.vars
```

在被 Git 忽略的 `gateway/.dev.vars` 中填写 `DEEPSEEK_API_KEY`。Gateway 默认使用 DeepSeek 官方 Responses API、`deepseek-v4-flash` 和 `high` 推理强度；旧 `OPENAI_*` 配置仍兼容。然后启动 Gateway：

```powershell
npm run gateway
```

另开一个 PowerShell 终端，以 Cloud 模式启动 Web：

```powershell
$env:EXPO_PUBLIC_PROPOSAL_MODE = 'cloud'
$env:EXPO_PUBLIC_AI_GATEWAY_URL = 'http://127.0.0.1:8787'
npm run web
```

恢复默认本地规则模式：

```powershell
$env:EXPO_PUBLIC_PROPOSAL_MODE = 'mock'
Remove-Item Env:EXPO_PUBLIC_AI_GATEWAY_URL -ErrorAction SilentlyContinue
npm run web
```

详细配置、错误语义和安全边界见 [Gateway 本地运行说明](gateway/README.md)。

### 本地使用中科大邮箱

邮箱能力同样依赖本地 Gateway。在被 Git 忽略的 `gateway/.dev.vars` 中填写 `USTC_EMAIL` 和 `USTC_EMAIL_APP_PASSWORD`，启动 `npm run gateway` 后，从“收件箱”的“学校邮箱”入口查看最近 10 封邮件。列表只读取 metadata，正文只在用户打开单封邮件时读取；只有点击“加入 Reflow”才会创建 Capture。该能力不是自动同步或完整邮件客户端。

### 重置 Demo 数据

点击页面左上角的 Reflow 品牌入口，可以：

- 重置 Demo 数据；
- 导出本地备份；
- 导入并校验备份；
- 查看当前数据边界说明。

重置会恢复预置演示数据，不会上传任何内容。

## 快速体验

1. 打开左上角品牌入口并重置 Demo 数据。
2. 在“今天”输入一条事项，例如“整理下周汇报提纲”。
3. 前往“收件箱”，查看整理后的标题和少量关键信息；必要时进入修改交互补充更多内容。
4. 没有建议日期时，通过可视化日期选择器选定计划日期，再确认加入对应日期。
5. 回到“今天”，直接完成简单任务；复杂任务点击 Task Detail 后安排日期、开始时间和时长。
6. 如有冲突，确认系统不会自动修改其他任务，再选择取消或“仍然安排”。
7. 开始任务，在“进行中”记录进展并通过暂停 / 继续推进执行，然后完成任务。
8. 在“日历”中确认计划与完成状态同步，再到“回顾”切换今天 / 本周 / 本月，查看确定性计划与执行事实及知识卡数量。
9. 刷新页面，确认任务、计划事件和执行记录仍然保留。

## 检查与测试

```bash
# TypeScript
npm run typecheck

# ESLint
npm run lint

# Jest 单元测试
npm test

# 本地 Gateway 单元测试
npm run test:gateway

# Web 核心流程
npm run test:e2e

# 导出静态 Web，产物位于 dist/
npm run export:web
```

当前测试覆盖：

- Capture 与 Proposal Pipeline；
- Mock Proposal 的确定性输出；
- Cloud Draft Schema、字段组合、请求白名单和安全错误；
- Cloud Proposal 的 nullable 字段、旧 v4 数据兼容与本地规则显式回退；
- UserDecision、撤销和正式产物写入；
- 任务执行、单一当前任务与计划 Action；
- 日期、时区、跨日拒绝和半开区间冲突；
- Today、Calendar 和 Review Selector；
- 跨午夜耗时统计；
- 内部数据结构 schema v1–v4 迁移；
- 备份结构、ID、引用和时间字段校验；
- 捕捉、排期、执行、完成、顺延、回顾、刷新和备份恢复的 Web 流程。
- 中科大邮箱 metadata 列表、按需详情读取和显式加入 Capture 的边界。

首次运行 Playwright 时，如果本机没有 Chromium：

```bash
npx playwright install chromium
```

## 静态导出与发布

普通静态导出：

```bash
npm run export:web
```

GitHub Pages 构建需要仓库路径前缀。在 PowerShell 中可以运行：

```powershell
$env:GITHUB_PAGES = 'true'
npm run export:web
```

本地预览导出结果：

```powershell
python -m http.server 4173 -d dist
```

然后访问 `http://localhost:4173`。

面向 `main` 的 Pull Request 和 `main` 分支的 push 会触发 GitHub Actions 验证：

- 类型检查、lint、Jest、Gateway 单元测试、Playwright E2E 和静态导出。

官方仓库使用 GitHub Actions 发布 Pages。改动通过 PR 合入 `main` 后，`main` 的 push 会触发完整验证和静态站点部署；功能分支本身不会直接发布。在线 Demo 始终保持本地规则（Mock）为默认模式，不会因为部署最新前端而自动调用云端模型。

## 数据与隐私

- 默认 Mock 模式没有账号、后端、遥测或第三方 AI 请求；
- Cloud 模式只向本地 Gateway 发送当前输入、输入来源、基准日期、时区和语言；
- Cloud 模式不会上传现有任务、任务状态、计划日期、计划事件、执行日志、知识卡片、UserDecision、回顾或备份；
- Gateway 从服务端环境读取模型 API Key，前端 Bundle、浏览器存储和仓库都不包含 Key；
- Gateway 不记录 Capture 原文，不保存会话、任务或模型原始响应；
- 中科大邮箱账号与客户端专用密码只由本地 Gateway 读取；列表不读取正文，详情使用只读 IMAP，邮件不会被标记已读、移动、回复或删除；
- 任务、Capture、Proposal、UserDecision、计划事件、耗时、进展和知识卡片保存在当前浏览器；
- 弹窗、loading、toast 和当前 Tab 等瞬时 UI 状态不会持久化；
- 没有本地数据时以空白状态启动，Demo 数据只能由用户显式重置；主数据损坏时会尝试最后一个合法恢复副本，两份数据均无效时显示恢复失败且不覆盖原存储；
- 备份导入会验证版本、集合结构、ID 唯一性、引用完整性和时间字段；
- 验证失败不会修改主数据、恢复副本或 React Store；
- 浏览器存储和导出的 JSON 备份目前不加密，需要用户自行妥善保管。

## 当前限制

当前版本尚未实现：

- P2 公网 Gateway、公开 Demo 的 Cloud 默认模式和第一次使用隐私确认；
- 面向公网的正式认证、严格配额和完整防滥用；
- 云端 Proposal 的 3～7 天真实使用验证；
- 登录、账号和跨设备云同步；
- 课程表和学校教务系统接入；
- 外部日历、飞书和分享扩展，以及中科大邮箱以外的邮件服务；
- 通知、语音识别和移动端快捷入口；
- 项目、标签和周期任务；
- 独立知识库及知识搜索；
- 真实 AI Observation、Memory 和 Personal Pattern；
- Web 拖拽排期；
- 多人协作；
- 原生安装包发布；
- 自主 Agent 和长期自主运行。

这些功能不属于当前 V1 的完成范围。

## 开发与协作

- 稳定版本分支为 `main`；
- 不 force push，不重写 `main` 历史；
- 不删除已有产品参考文件；
- 新功能优先保证核心流程稳定、可追踪、可撤销；
- 提交前应运行与改动相关的检查；
- 面向 `main` 的 PR 由 GitHub Actions 自动验证，合入 `main` 后再部署 Pages。

更详细的实施里程碑和领域约束见 [docs/implementation-plan.md](docs/implementation-plan.md)。

云端 Proposal 的当前状态与模型评测见：

- [P0/P1 实施记录](docs/cloud-proposal-plan.md)
- [最终模型评测报告](docs/cloud-proposal-evaluation.md)
