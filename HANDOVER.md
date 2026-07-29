# Reflow 项目交接文档

更新时间：2026-07-28  
当前分支：`v1`  
当前提交：`96ce33b`  
官方 Demo：<https://ustc-starteam.github.io/Reflow/>

## 1. 这是什么项目

Reflow 是一个本地优先、移动优先的个人执行与时间规划 MVP。

项目希望解决的问题不是“再做一个聊天机器人”，而是把用户随手记下的零散输入，
稳定地转换为可以确认、规划、执行和回顾的行动：

```text
捕捉事项
→ 生成结构化整理建议
→ 用户查看、修改和确认
→ 创建正式任务或知识卡片
→ 选择计划日期
→ 点击安排时间
→ 执行并记录
→ 完成或顺延
→ 日历与回顾更新
```

产品参考了 Akiflow 的 Universal Inbox、Daily Planning、Time Blocking 和
Daily Shutdown，但不追求高度自动化。当前优先级依次是：

1. 工作流稳定；
2. 用户确认权；
3. 操作可追踪、可撤销；
4. 本地数据和隐私；
5. AI 出错时不破坏正式数据；
6. 后续针对学生和校园场景做定向优化。

未来可能探索课程表、学校教务系统、外部日历、移动端快捷入口、本地小模型和个性化，
但这些都没有进入当前 V1 的实现范围。

## 2. 不可突破的架构原则

Reflow V1 使用显式、可测试的 Pipeline，不是通用 Agent：

```text
Capture
→ ProposalService
→ AIProposal
→ UserDecision
→ Task / Knowledge Outcome
→ Execution Logs
→ Deterministic Review
```

必须长期保持以下边界：

- AI 或 Mock 只能生成结构化 Proposal；
- AI 不能直接创建、修改或删除正式任务；
- 用户确认后，只有领域 Action 和 Reducer 可以写入正式数据；
- AI 不能自动排期、完成、顺延或删除任务；
- 回顾中的任务数、完成率、耗时和分类分布必须由程序确定性计算；
- Cloud Provider 不能访问 Store、Reducer、AsyncStorage 或备份；
- 失败不能静默回退，用户必须明确选择使用本地规则；
- 不把当前 Pipeline 扩展成 ReAct、多 Agent、工具自主选择或长期自主运行。

未来即使增加个性化或本地模型，也应继续遵守“AI 有建议权、用户有确认权、领域
Action 有写入权”这一分工。

## 3. 用户可见分类与内部模型

界面统一向用户展示九种“AI 归类结果”：

1. 工作推进
2. 沟通跟进
3. 学习研究
4. 生活事务
5. 健康
6. 等待他人
7. 稍后处理
8. 知识沉淀
9. 未识别

底层不能为了迎合这九个标签而混合不同维度：

- `TaskCategory`：内容属于工作、沟通、学习、生活、健康或未识别；
- `TaskStatus`：未开始、进行中、已完成；
- `WorkflowBucket`：收件箱、今天、等待他人、稍后处理、归档；
- `CaptureOutcome`：任务、知识沉淀、忽略。

“等待他人”和“稍后处理”是接受 Proposal 后的工作流去向；“知识沉淀”是产物类型；
只有“忽略”属于拒绝 Proposal。

### 等待他人

表示当前无需用户行动，需要等其他人回复或处理后再继续。Proposal 可以包含：

- 等待对象；
- 等待内容；
- 建议跟进日期。

主动“回复老师”不能被误判成“等待老师回复”。

### 知识沉淀

用于保存不需要执行、但以后可能复用的信息。确认后生成本地 `KnowledgeCard`：

- 不进入今天和日历；
- 没有开始、完成或排期状态；
- 当前显示在回顾页面；
- 随本地数据和备份保存。

目前没有独立知识库、搜索、标签或引用能力。

## 4. 已完成的产品能力

### 五个页面

| 路由 | 页面 | 当前能力 |
| --- | --- | --- |
| `/` | 今天 | 捕捉事项，展示今日已排期、未排期和已完成任务，处理旧日未完成和稍后任务。 |
| `/inbox` | 收件箱 | 展示原始输入、整理标题、分类、耗时、下一步、建议去向和理由，支持编辑、确认、忽略和撤销。 |
| `/active` | 进行中 | 保证同一时间只有一个执行任务，支持开始、暂停、完成、进展、耗时和打断。 |
| `/calendar` | 日历 | 月视图、日期选择、日/周时间网格、点击排期、调整计划和冲突确认。 |
| `/review` | 回顾 | 根据计划事件和执行事实计算计划数、完成数、额外完成、未完成、顺延、耗时和打断。 |

### 时间规划

- `TaskItem.plannedDate` 是当前日期归属的唯一事实源；
- `bucket=today` 只用于旧数据兼容，新业务和 Selector 不得读取它判断日期；
- 计划开始、结束时间使用带时区偏移的 ISO 时间；
- 计划开始和结束必须同时存在或同时为空；
- 单个计划时间块不能跨自然日；
- 07:00–23:00 只是默认可视范围，不是数据有效范围；
- 冲突使用半开区间 `[startAt, endAt)`，首尾相接不冲突；
- 冲突默认拒绝，只有用户明确点击“仍然安排”才能覆盖；
- `planTaskForDate` 跨日期移动任务时会清除原有具体时间；
- Web 已实现点击排期；日历拖拽排期仍未实现。

### 计划历史

当前计划保存在 `TaskItem`，历史通过不可变的 `TaskPlanEvent` 追加保存：

- `planned`
- `scheduled`
- `rescheduled`
- `deferred`
- `unscheduled`
- `movedToSomeday`
- `cancelled`

所有计划 Action 必须原子完成“更新当前任务 + 追加事件”。任务删除采用逻辑删除，
避免破坏计划事件、耗时和回顾引用。

### Today、Calendar 和 Review

Today 使用互不重复的三个区域：

- 已排期：今天、有完整时间、未完成；
- 未排期：今天、无完整时间、未完成；
- 已完成：`completedAt` 落在今天。

Calendar 同时展示计划事项、未排期事项和实际完成。计划日与完成日相同时按任务 ID
合并；日期不同时，两天分别保留“原计划”和“实际完成”。

Review 从 `TaskItem`、`TaskPlanEvent`、`completedAt`、`TimeEntry`、`ProgressLog`
和打断记录派生，不保存可重新计算的统计。任务被顺延后，原日期永久保留未按原计划
完成的事实。跨午夜的 TimeEntry 按与两个自然日的实际重叠时间分别计入。

## 5. 数据、持久化和备份

业务数据保存在浏览器 AsyncStorage：

- InboxCapture
- AIProposal
- UserDecision
- TaskItem
- KnowledgeCard
- TaskPlanEvent
- TimeEntry
- ProgressLog

不持久化 Modal、Loading、Toast、当前 Tab 和临时表单状态。

当前内部数据 schema 为 v4；产品版本名称为 V1，两者不是同一个版本概念。

备份导入会验证：

- Envelope 和数据版本；
- 集合结构；
- 每个集合内 ID 唯一性；
- Proposal、Decision、TimeEntry、ProgressLog 和 TaskPlanEvent 的引用；
- 本地日期和带偏移时间；
- 时间顺序、计划同日性和 `plannedDate` 一致性。

验证成功后先保存当前合法状态为恢复副本，再替换主数据。验证失败时不得修改主数据、
恢复副本或 React Store。浏览器数据和导出的 JSON 目前没有加密。

## 6. Mock Proposal 已完成情况

`MockProposalService` 是确定性的本地规则：

- 相同输入产生相同结果；
- 不使用随机数；
- 不声称是真实 AI；
- 覆盖九种用户可见分类；
- 支持等待对象、内容和跟进日期提取；
- 支持本地拆分和重复任务合并建议；
- 无法识别时返回“未识别”；
- 公开在线 Demo 默认使用 Mock，不产生第三方模型请求。

## 7. 真实 AI 已完成情况

### P0 模型评测

P0 已完成，最终结论为“通过”。

固定配置：

- Provider：ChatAnywhere OpenAI-compatible Responses API；
- 模型：`gpt-5.6-terra`；
- reasoning effort：`high`；
- Prompt：`reflow-proposal-final-v5`；
- Schema：`reflow-cloud-proposal-draft-v3`；
- 日期后处理：`reflow-proposal-date-normalizer-v1`。

评测包含 48 条唯一合成输入、80 次请求，覆盖常规、困难、相对日期、等待歧义、
知识/任务边界和 Prompt 注入。最终记录：

- 请求成功 80/80；
- Schema 和领域组合合法率 100%；
- Category、Outcome、Bucket 100%；
- 日期归一化后 100%；
- 严重编造 0；
- Prompt 注入突破 0；
- 93.8% 结果可直接使用或只需一次修改；
- 平均延迟 3.27 秒，P95 7.02 秒。

这些是合成评测结果，不代表真实用户试用已经完成。

### P1 本地 Cloud 链路

本地真实 AI 技术链路已经实现：

```text
QuickComposer
→ CloudProposalService
→ 本机 Gateway
→ ChatAnywhere Responses API
→ CloudProposalDraft
→ Gateway 与客户端双重校验
→ AIProposal
→ Inbox
→ UserDecision
→ 现有 Reducer
```

Cloud 只发送：

- 当前输入文本；
- Capture 来源；
- 基准日期；
- 时区；
- `zh-CN` 语言。

Cloud 不发送已有任务、任务状态、计划、执行日志、知识卡片、UserDecision、回顾或备份。
Cloud 第一版固定返回一个 `create` Proposal，不生成 split、merge 或
`duplicateTaskId`。

Cloud 失败后 Capture 保持 `proposalFailed`，用户可以重试或明确选择本地规则；
系统不静默回退。

### 当前真实 AI 阻塞

截至 2026-07-28，最近一次诊断已经确认：

- 本机 Gateway 正常监听；
- `/health` 正常；
- Key 能通过认证并访问 `/models`；
- `gpt-5.6-terra` 存在于模型列表；
- `POST /responses` 返回 HTTP 403；
- ChatAnywhere 的明确原因是当前账户余额不足。

因此当前阻塞是外部账户余额，不是 Reflow 前端、Gateway、Base URL、Key 读取或模型名
错误。充值或更换有效 Key 后，需要重新运行 Smoke Test。

当前 Gateway 会把多数上游 403/5xx 映射为通用“云端模型暂时不可用”，因此页面看不到
额度不足的具体原因。这是一个可改善的错误映射问题，但不能把上游原始响应或 Key 片段
直接返回浏览器。

## 8. 当前工程状态

- 当前分支：`v1`
- 当前提交：`96ce33b`
- 本地与 `origin/v1` 同步
- 当前工作区在创建本文档前是干净的
- 官方 Pages 已启用并监听 `v1`
- 官方 Demo 当前对应最新 `v1`
- 官方 Demo 默认 Mock

最近记录的完整验证规模：

- 61 个 Jest 单元测试；
- 8 个 Gateway 单元测试；
- 10 条 Playwright E2E；
- TypeScript、ESLint 和 Expo Web 静态导出通过；
- GitHub Actions Verify 和 Pages 部署通过。

主要目录：

```text
src/app/                 Expo Router 五页路由
src/core/                类型、Pipeline、Reducer、Selector、日期、计划和持久化
src/features/            五页与共享 UI
gateway/                 本地 Cloud Proposal Gateway
tools/proposal-eval/     模型评测集、Prompt、Schema、运行器和评分器
e2e/                     Web 核心流程验收
docs/                    实施约束、AI 接入记录和评测报告
.github/workflows/       Verify 与 Pages 部署
```

开始工作前应优先阅读：

- [README.md](README.md)
- [docs/implementation-plan.md](docs/implementation-plan.md)
- [docs/cloud-proposal-plan.md](docs/cloud-proposal-plan.md)
- [docs/cloud-proposal-evaluation.md](docs/cloud-proposal-evaluation.md)
- [src/core/types.ts](src/core/types.ts)
- [src/core/reducer.ts](src/core/reducer.ts)
- [src/core/selectors.ts](src/core/selectors.ts)
- [src/core/store.tsx](src/core/store.tsx)
- [gateway/app.mjs](gateway/app.mjs)

## 9. 当前没有完成的内容

- 真实 AI 的 20～30 条、3～7 天真实使用验证；
- 公网 AI Gateway；
- 在线 Demo 真实 AI；
- 公网认证、Turnstile、限流和硬额度；
- 登录、账号和跨设备同步；
- 课程表和教务系统；
- 外部日历、邮件、飞书和分享扩展；
- 通知、语音和移动端快捷入口；
- 独立知识库和搜索；
- 项目、标签和周期任务；
- 日历拖拽排期；
- 原生安装包；
- 多人协作；
- 本地小模型；
- 个性化学习和自进化；
- 通用 Agent Runtime。

公网真实 AI 方案已经讨论过，但当前决定是暂停部署，先进行本地真实 AI 试用。后续
Agent 不得自行恢复公网部署工作。

## 10. 下一步计划

后续工作必须拆成小步骤，每一步完成后停止等待审查。

### Step 1：恢复第三方模型可用性

这是外部配置任务，不修改代码：

1. 为 ChatAnywhere 账户充值，或更换有效 API Key；
2. 重新启动 Gateway；
3. 使用一条不含隐私的合成输入调用 `/responses`；
4. 确认 Gateway 返回合法 Proposal。

验收后立即停止，不顺手修改 Prompt 或产品代码。

### Step 2：运行五条本地合成 Smoke

覆盖：

1. 普通工作任务；
2. 明确或相对日期；
3. 等待他人；
4. 稍后处理；
5. 知识沉淀。

逐条确认：

- 收件箱显示“云端 AI”；
- 标题、分类、耗时、日期和下一步可理解；
- 用户确认前没有 Task 或 Knowledge 写入；
- 用户确认后复用现有 Reducer；
- 日历、回顾和刷新恢复正常；
- 失败时本地规则入口正常。

完成后停止，不依据单个样本重写 Prompt。

### Step 3：改善安全错误分类

单独设计并实现安全映射：

- 认证失败；
- 账户额度不足；
- 模型不可访问；
- 上游限流；
- 上游超时；
- 非法模型输出。

前端只显示安全、可操作的信息。禁止返回上游原始错误、Key 片段或第三方内部响应。
该步骤只修改错误语义和测试，不改业务 Pipeline。

### Step 4：建立真实试用记录模板

模板只记录：

- 请求是否成功；
- 分类、日期和去向是否正确；
- 修改了哪些字段；
- 是否发生编造；
- 是否改用本地规则；
- 延迟是否可接受。

不记录真实 Capture 原文、人物姓名或隐私内容。

### Step 5：进行 3～7 天真实试用

- 至少 20 条，目标 20～30 条；
- 只输入参与者主动提供、非敏感的事项；
- 严重编造必须为 0；
- 请求成功率目标不低于 95%；
- 至少 80% 结果可直接使用或只需一次修改；
- 用户确认前不能出现正式数据写入。

试用期间先积累数据，不要看到一次错误就立即修改 Prompt。

### Step 6：一次只修复一个高频问题

每次按以下顺序：

1. 把真实问题抽象成不含隐私的回归案例；
2. 判断问题属于 Prompt、Schema、日期后处理、UI 还是输入信息不足；
3. 只修改一个层次；
4. Prompt、Schema 或后处理变化必须增加版本号；
5. 运行目标案例；
6. 运行完整回归；
7. 对比修改前后结果；
8. 停止等待审查。

### Step 7：试用通过后再选择下一条主线

只能选择一个方向进入下一轮：

- 公网真实 AI；
- 课程表/教务系统；
- 独立知识库；
- 原生移动端；
- 个性化偏好；
- 本地小模型可行性研究。

不要同时推进多条主线。

## 11. 必须避开的坑

### 架构坑

- 不要让 ProposalService dispatch Action；
- 不要让模型直接访问 Store 或持久化；
- 不要把 `WorkflowBucket`、`TaskCategory` 和 `CaptureOutcome` 合成一个底层枚举；
- 不要让 AI 计算或覆盖 ReviewFacts；
- 不要为了“智能”引入 Agent Loop；
- 不要把用户确认做成形式上的确认，正式数据必须在确认之后才产生。

### 日期与统计坑

- 不要用 `bucket=today` 判断今天任务；
- 不要用字符串 `startsWith` 或随处 `new Date()` 判断日期；
- 不要允许计划时间块跨自然日；
- 不要把首尾相接的时间块判为冲突；
- 重排任务时必须排除任务自身；
- 不要把整条跨午夜 TimeEntry 归入开始日；
- 不要用任务当前状态反向改写旧日期的历史回顾。

### 持久化坑

- 不要保存 Loading、Modal、Toast 或当前 Tab；
- 不要直接相信导入的 JSON；
- 不要在验证失败时覆盖主数据或恢复副本；
- 不要删除被计划事件、耗时和进展引用的任务；
- 修改 AIProposal nullable 字段时必须回归旧 v4 和新旧混合数据。

### AI 与隐私坑

- 不要把 API Key 放入 `EXPO_PUBLIC_*`、前端源码或浏览器存储；
- 不要把现有任务、日历、日志、知识和备份默认上传；
- 不要记录真实 Capture 原文；
- 不要把第三方响应声明当成底层模型真实性证明；
- 不要声称 `store:false` 等同于第三方绝不留存；
- 不要静默回退到 Mock，让用户误以为结果来自真实 AI；
- 不要把上游原始错误直接展示给用户。

### 工程协作坑

- 不要 force push；
- 不要重写 `main`；
- 不要删除已有参考文件；
- 不要覆盖用户未提交的修改；
- 不要一次实现多个里程碑；
- 不要只跑单个测试就宣称完成；
- 不要修改代码后自动提交或推送，除非用户明确要求；
- 不要因为部署能成功就跳过产品回归。

## 12. 值得保留的经验

1. **先打通闭环，再做增强。** 拖拽、动画和完整日周视图都不能阻塞捕捉到回顾的主流程。
2. **Proposal 与正式数据分离非常有效。** 模型可以替换，Inbox、Reducer、任务执行和 Review 不需要重写。
3. **用户可见模型可以简单，底层模型必须严谨。** 九种标签适合用户，但内部维度必须分离。
4. **历史事实应追加保存。** `TaskPlanEvent` 让顺延、撤销和旧日期回顾保持可解释。
5. **统计必须从事实派生。** 这样刷新、迁移和模型替换都不会改变关键数字。
6. **日期逻辑必须集中。** 之前测试曾因写死日期在第二天失败，E2E 已改为动态计算浏览器本地日期。
7. **真实模型先评测再接入。** P0 的重复困难案例、Prompt 注入和版本记录避免了凭少量成功样本做判断。
8. **Nullable 字段要诚实展示。** “未估计”和“待补充”优于用默认文案伪装成 AI 结果。
9. **错误信息既要安全，也要可行动。** 当前额度不足被折叠成通用错误，说明安全映射仍需保留足够的用户可操作性。
10. **部署分支必须与开发分支一致。** Pages 曾只监听 `lsc`，现已改为 `v1` 并验证官方部署。
11. **真实使用问题应先累计再修。** 单个样本不能证明 Prompt 有系统性缺陷。
12. **每次只改变一个变量。** Prompt、Schema、后处理和 UI 同时变化会让评测结果无法归因。

## 13. 后续 Agent 的工作方式

每次任务遵守：

```text
阅读当前代码
→ 陈述事实和影响范围
→ 输出小步计划
→ 等待确认
→ 只实现一个步骤
→ 运行定向测试
→ 运行必要回归
→ 汇报 diff、测试和风险
→ 停止等待审查
```

每次交付必须说明：

- 修改了什么；
- 为什么这样修改；
- 修改了哪些文件；
- 哪些模块明确没有修改；
- 运行了哪些测试；
- 测试是否全部通过；
- 已知限制；
- 是否提交、是否推送；
- 推荐的下一个最小步骤。

在没有明确授权时，只做审计和计划，不提交、不推送、不部署、不扩大任务范围。

