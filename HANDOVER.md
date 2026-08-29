# Reflow 项目交接文档

更新时间：2026-08-29

> 当前阶段：Competition Stabilization / 比赛作品提交准备。产品功能暂时冻结，以最新 `main` 为比赛版本；没有真实回归时不再新增功能或主动扩大审计范围。

## 1. 当前仓库状态

- 稳定分支：`main`
- 本文更新时的 `main`：`83d7773`（PR #28 已合并）
- 当前没有未合并的 GitHub PR。
- 最近进入 `main` 的关键改动：
  - PR #24：Review / Execution correction；
  - PR #25：只读中科大邮箱按需加入 Capture；
  - PR #26：仓库状态与文档同步；
  - PR #27：收件箱“移出收件箱”语义；
  - PR #28：Task Detail 和排期弹窗统一使用可视化日期选择器。
- GitHub CI 面向 `main` 和 PR 执行 typecheck、lint、Jest、Gateway tests、Playwright E2E 与 Web 静态导出。
- GitHub Pages 从 `main` 构建，公开 Demo 默认使用 Mock Proposal，不调用真实模型，也不连接学校邮箱。

仓库协作必须遵守 `AGENTS.md` 与 `CONTRIBUTING.md`：小步修改、分支 + PR、禁止直接 push `main`，CI 通过后再由 PR 作者决定合并。

## 2. 产品是什么

Reflow 是一个 local-first、mobile-first 的 Personal Execution Web MVP。它不以聊天或通用 Agent 为中心，而是把零散输入稳定地变成可确认、可规划、可执行、可回顾的个人行动。

```text
External Input
├─ Manual Text
└─ USTC Email（只读、按需读取、用户显式加入）
       ↓
Capture
→ ProposalService
→ AIProposal
→ UserDecision
→ Task / Knowledge
→ Planning
→ Execution
→ Deterministic Review
```

核心价值不是“AI 自动替用户做决定”，而是：

1. AI 帮用户把混乱输入整理为结构化建议；
2. 用户查看、修改并确认；
3. 正式数据只由领域 Action / Reducer 写入；
4. 计划、执行与回顾都可追踪；
5. AI 失败时不会破坏正式任务。

## 3. 不可突破的架构边界

- AI / Mock 只能生成 pending Proposal。
- 用户确认前不能创建正式 Task、Knowledge、UserDecision 或 TaskPlanEvent。
- 只有现有 Store API → Domain Action → Reducer 可以修改正式数据。
- AI 不能自动排期、开始、完成、顺延或删除任务。
- `TaskItem.plannedDate` 是任务当前日期归属的唯一事实源。
- 具体时间必须同时具有 `plannedStartAt` 和 `plannedEndAt`，且属于同一自然日。
- 每次正式规划变化必须按现有语义追加 `TaskPlanEvent`。
- TimeEntry、ProgressLog 和 interruption 是执行事实，不得为了 UI 效果伪造或静默改写。
- Review 的任务数、完成情况、投入时间和打断次数必须由确定性 Selector 派生。
- Cloud Provider 不得访问 Store、Reducer、AsyncStorage 或备份。
- Cloud 失败不得静默切换 Mock；回退必须由用户明确选择。
- 不引入 ReAct、自动工具调用、多 Agent loop、长期自主运行或长期记忆来替代现有 Pipeline。

## 4. 当前已经实现的产品能力

### Today `/`

- 快速文本 Capture；
- 需要处理、今日提示、时间安排、今天要做、已完成和稍后入口；
- 简单任务可以直接完成；
- 点击复杂任务进入中央 Task Detail；
- Detail 可以修改标题、计划日期、预计时长和下一步行动；
- Task Detail 与“安排任务时间”都使用可视化月历选择日期；
- date-only Task 可以安排具体时间，exact-time Task 可以调整或取消具体时间；
- 跨日期修改已有具体时间时需要用户明确确认。

### Inbox `/inbox`

- 展示 AI / Mock 整理后的待确认 Proposal；
- 一级页面只突出标题、日期、类型、预计耗时等决策信息；
- 支持修改、可视化选择计划日期、确认、移出收件箱与撤销最近决定；
- 失败 Capture 可以重试 Cloud 或由用户明确改用本地规则；
- 学校邮箱入口按需读取最近邮件，用户点击“加入 Reflow”后才创建 Capture。

### Active `/active`

- 一次只保持一个当前任务；
- 支持开始、暂停 / 继续、完成；
- 支持记录进展和记录中断；
- 显示当前执行段、任务累计时间与最近进展；
- 没有当前任务时优先展示最近暂停任务，并补充少量今天候选；
- 暂停、完成或切换超长 / 跨日执行段时，使用现有 ExecutionCorrectionModal 要求用户核对实际时长。

### Calendar `/calendar`

- 默认 Month，查看整月事项分布；
- Week 查看一周负载与日期分布；
- Day 用于具体时间规划；
- 明确区分 date-only 当天事项与 exact-time 时间块；
- 安排、重新排期、取消具体时间与冲突确认均复用现有 planning Action；
- 冲突不会自动挪动其他任务，只有用户明确确认后才能保留冲突。

### Review `/review`

- 支持今天 / 本周 / 本月三个确定性周期；
- 根据 Task、TaskPlanEvent、completedAt、TimeEntry 和 interruption 派生计划与执行事实；
- 展示 Needs Attention；
- 已经关闭但可能异常的跨日 / 超长 TimeEntry 可以人工核对修正；
- 知识沉淀入口可以查看已保存 KnowledgeCard；
- Review 不负责重新规划，也没有真实 AI Personal Pattern 或 Memory。

### Persistence / Backup

- 业务数据保存在当前浏览器 AsyncStorage；
- 没有本地数据时以空白状态启动，Demo 数据只能由用户显式重置；
- 主数据损坏时尝试最后一个合法恢复副本，两份数据都无效时显示恢复失败；
- 写入失败会对用户可见并可以重试；
- 备份导入验证版本、集合结构、ID、引用与时间字段，失败时不覆盖现有数据；
- Modal、Toast、loading、当前 Tab 和临时表单不持久化。

## 5. AI Proposal 当前状态

`ProposalService` 有两个实现：

- `MockProposalService`：确定性本地规则，是公开 Demo 和普通启动的默认实现；
- `CloudProposalService`：通过本地 Gateway 调用一次真实模型请求，并把严格校验后的 Draft 映射为同一种 `AIProposal`。

Cloud 请求只发送当前 Capture 文本、source、referenceDate、timeZone 和 locale，不上传任务库、计划、执行日志、知识、UserDecision、Review 或备份。

Gateway 当前 tracked 默认配置：

```text
DeepSeek Responses API
model = deepseek-v4-flash
reasoning effort = high
upstream timeout = 15s
```

同时保留 `OPENAI_*` 兼容配置。真实运行使用哪个 Provider，以本机被 Git 忽略的 `gateway/.dev.vars` 或进程环境为准；编写比赛材料前必须核对演示时的真实配置，不能把兼容 Provider、底层模型和历史 Trial 混写。

Gateway 还承担只读 USTC IMAP 接口：列表只取 metadata，正文只在用户打开单封邮件时按需读取，使用 `BODY.PEEK`，不标记已读、不下载附件，也不能发送、回复、移动或删除邮件。

模型 API Key、学校邮箱和客户端专用密码只能放在本地 Gateway 环境或被忽略的 `gateway/.dev.vars`，禁止进入前端、Git、浏览器存储、日志、演示视频或提交材料。

## 6. 当前部署与运行方式

普通本地 Web：

```powershell
npm ci
npm run web
```

真实 Cloud Proposal：

```powershell
# 终端一：先在 gateway/.dev.vars 配置本机 Secret
npm run gateway

# 终端二
$env:EXPO_PUBLIC_PROPOSAL_MODE = 'cloud'
$env:EXPO_PUBLIC_AI_GATEWAY_URL = 'http://127.0.0.1:8787'
npm run web
```

公开 GitHub Pages 是静态 Web，只能安全使用默认 Mock。P1 Gateway 仍是本地开发服务，没有生产认证、账号、数据库、严格配额或公网部署，不得把它描述成已上线的公网 AI 服务。

## 7. 已知问题和真实边界

### 当前待处理：Active 超长未结束执行段的展示

真实使用已发现：如果任务开始后长时间没有暂停或完成，Active 会用“当前时间 − 最后一次 start”直接展示当前执行段和任务累计时间，可能出现数万分钟。

现有保护只在用户点击暂停、完成或切换任务时弹出执行时间核对；Active 一级页面本身仍把待核实的开放执行段显示为普通数字。该问题尚未修复。

比赛演示前的安全做法：

- 不使用包含超长开放执行段的旧 Demo 状态录制；
- 先通过暂停 / 完成入口的“调整实际时长”完成核对；
- 不点击“按原记录保存”来接受明显错误的超长时间；
- 如需代码修复，只允许做一个 smallest sufficient regression fix：把超长 / 跨日开放段标为“待核对”，复用现有校正语义，不自动清零、不自动截断、不改 Review Kernel。

### 其他边界

- Web 是当前主要运行与验收环境，尚未发布原生安装包；
- Cloud AI 与 USTC Email 依赖本地 Gateway；
- USTC Email 不是后台同步或完整邮件客户端；
- 没有账号、跨设备同步、课程表、外部日历、通知、语音、周期任务或多人协作；
- 没有独立知识库搜索、真实 AI Observation、Memory 或 Personal Pattern；
- 没有公开 Cloud Gateway 和面向公网的防滥用体系；
- 浏览器存储与导出的 JSON 备份未加密；
- 真实 Cloud Proposal 尚不能表述为长期、大样本生产验证完成。

## 8. 比赛提交阶段

作品提交截止：通知写明为 **9 月 6 日 23:59**。

当前开发原则：

```text
功能冻结
→ 只修阻塞演示或破坏真实数据的回归
→ 准备提交材料
→ 演示排练
→ 生成最终压缩包
→ 上传并分享
```

必须准备四项材料：

1. 设计文档：设计思路、技术架构、功能模块和技术难度；
2. 约 5 分钟演示视频：真实校园 / 学习生活场景、实用性和主要功能；
3. 智能体 / 可部署程序文件：提交前测试通过；
4. 作品简介：PDF 或 Word，说明背景、问题、核心功能、实际模型和 API 调用方式、创新点。

四项材料放进单个压缩文件，由队长提交。压缩包名称按通知要求使用：

```text
队长学号+队长手机号+智能体赛道+本科生队伍/研究生队伍
```

在瀚海教学网“我的资源 → 文件”上传后，将文件分享给个人账号 `P0581`，勾选允许复制与允许下载。后续可能另行要求源代码，因此必须保留最终提交对应的 Git commit、依赖锁文件和源代码快照。

### 比赛材料应突出

- 学生面对零散事项、邮件和计划执行脱节的真实问题；
- 从 Capture 到 Review 的完整可运行闭环；
- AI Proposal 与正式领域数据之间的用户确认边界；
- local-first、隐私最小化和只读邮箱接入；
- 结构化输出、Schema 校验、安全错误、显式回退和确定性 Review；
- 五个 Product Surface 的移动优先体验；
- GitHub CI、测试和可部署性证据。

不要为了评分表声称已经实现 RAG、多智能体、长期记忆、自动排期、公网上线 Cloud AI 或原生 App。材料只能描述当前代码和现场实际演示的能力。

### 建议的 5 分钟演示主线

```text
问题与定位
→ 手动 Capture / 邮件显式加入
→ AI 或 Mock 生成结构化 Proposal
→ Inbox 修改并确认
→ Today 查看与 Task Detail 规划
→ Calendar 安排具体时间
→ Active 记录进展 / 中断并完成
→ Review 查看确定性结果
→ 强调用户确认、隐私和正式写入边界
```

正式录制前使用专门的干净演示数据，不展示 API Key、邮箱密码、真实邮件正文、真实个人事项、浏览器开发者工具中的认证头或被忽略的本地配置。

## 9. 比赛提交前检查清单

- [ ] 冻结并记录最终 `main` commit SHA；
- [ ] GitHub CI 全绿；
- [ ] 普通 Mock 闭环从 Capture 到 Review 可完整演示；
- [ ] 如演示 Cloud，使用非敏感合成输入并提前验证本机 Gateway；
- [ ] 如演示邮箱，使用适合公开展示的测试邮件，不暴露凭据或私人正文；
- [ ] 清理或修正超长开放执行段，避免错误时长进入录屏；
- [ ] 刷新后任务、决定、计划、执行和 Review 仍保留；
- [ ] 设计文档中的模型 / API 描述与现场配置一致；
- [ ] 演示视频约 5 分钟且能独立看懂；
- [ ] 可部署程序包含 README、依赖锁文件、启动说明和 `.dev.vars.example`，不含 `.dev.vars`；
- [ ] 压缩包中没有 API Key、邮箱凭据、真实备份、真实 Capture、调试日志或 `node_modules`；
- [ ] 压缩包命名、队长提交账号、P0581 分享和权限勾选正确；
- [ ] 本地保留最终压缩包、源代码快照和上传成功证据。

## 10. 后续维护方式

比赛提交前默认行为：

```text
没有真实问题 → 不修改代码
发现非阻塞问题 → 记录，不顺手修复
发现演示阻塞或数据正确性回归 → 单独小分支，smallest sufficient fix
新功能想法 → 比赛提交后再讨论
```

每次修复都必须：

1. 从最新 `main` 创建聚焦分支；
2. 不覆盖用户本地配置和未提交改动；
3. 只修改解决当前问题所必需的文件；
4. 运行最小相关验证，完整仓库验证交给 GitHub CI；
5. review diff，确认没有 Secret 和无关改动；
6. push 并创建 PR，不自动 merge；
7. CI 绿且人工确认后由 PR 作者合并；
8. 合并后清理对应分支。

## 11. 关键文件

```text
AGENTS.md                          Agent 默认开发规范
CONTRIBUTING.md                    两人协作和 Git / PR 规则
README.md                          当前产品、架构、运行和测试说明
HANDOVER.md                        当前交接与比赛提交状态
src/core/                          Domain、Reducer、Selectors、Persistence、Store
src/features/                      Today / Inbox / Active / Calendar / Review
gateway/README.md                  本地 AI 与 USTC Email Gateway
gateway/.dev.vars.example          无 Secret 的配置模板
docs/cloud-proposal-plan.md        Cloud Proposal 实施记录
docs/cloud-proposal-evaluation.md  模型评测记录
e2e/                               Web 核心闭环验收
.github/workflows/ci.yml           PR / main 完整验证
.github/workflows/deploy-pages.yml GitHub Pages 发布
```

以后发生状态变化时，只更新本文件的当前状态、已知问题、比赛检查清单和最终 commit；不要再把废弃分支的逐日过程记录追加成新的长篇历史。
