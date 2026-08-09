# fix/cloud-proposal-conservative-semantics

## 分支目的

收紧本地 Cloud Proposal 的 Day 1 保守语义，确保 AI 只生成待确认的单个 Proposal，且模糊输入、日期范围、延后意图、等待跟进和多行动输入不会被擅自补全。

## 范围

- Prompt、Schema、确定性后处理、Gateway/离线/Web 回归与相关 UI 映射；
- 日期与 nullable 字段的保守规则、历史 Suite 语义边界和 Windows Playwright 生命周期验证；
- 本地 DeepSeek Gateway 的合成 Smoke、安全失败分类，以及既有 `OPENAI_*` 兼容路径的 ChatAnywhere 最终 Trial。

## 明确不做

- 不删除 DeepSeek 支持，不改 15 秒上游 timeout、请求白名单或 Cloud Proposal Pipeline；
- 不引入 retry、Agent、工具调用、split 或多 Proposal；
- 不部署公网 Gateway、不做完整 80 条评测或长期真实试用；
- 语义 Gate 和全部自动门禁完成前不提交、push 或开 PR；最终只允许普通提交并推送当前功能分支，禁止直接修改或合并 `main`。

## 架构与产品不变量

- 1 Capture 只产生 1 个 `create` Proposal；AI 只有建议权。
- Proposal 在 `pending` 时不写正式数据；只有 UserDecision → Reducer 可以创建任务或知识卡片。
- 范围日期不臆测具体日；未明确的耗时、下一步、跟进日期保持 null。
- Gateway 不读取 Store、Reducer、持久化或既有用户数据；Key 仅存在本地 Gateway 环境。

## 当前验证状态

- Windows E2E 基础设施已修复：移除了 Playwright `webServer` 对 Expo / mock Gateway 生命周期的负责权，新增 PID-owned Node runner。它只启动、健康检查与清理本次记录的服务 PID，不复用既有端口或按进程名全局清理。
- 当前改动文件为 `package.json`、`playwright.config.ts`、`e2e/lifecycle-runner.mjs`、`e2e/run-e2e.mjs`、`e2e/lifecycle-runner-self-test.mjs`；未改产品、领域、AI 或 Gateway 业务代码。
- 生命周期自测 5/5 通过。受控端口污染会快速非零失败，且在启动任何其他服务前停止；这阻止 Mock 项目静默复用旧 Cloud 服务。
- 执行线程在端口干净条件下连续两轮完整 `npm run test:e2e` 均为 17/17，Playwright/runner code 0，服务和 8081/8082/8788 端口均清理。监督独立复跑也为 17/17、exit 0、无端口/进程残留。历史 480 秒 / 124 已由新 runner 解决，不再是当前 blocker。
- 其余最终门禁均有通过记录：typecheck、lint、Jest 72/72、Gateway 45/45、`export:web`、离线 proposal self-test 和 `git diff --check`。
- 当前 Cloud 合同：Prompt `reflow-proposal-conservative-v7`、Schema `reflow-cloud-proposal-draft-v4`、Normalizer `reflow-proposal-conservative-normalizer-v3`、`high` 和 15 秒上游生命周期 deadline。v7/v3 删除了裸短语精确白名单，并明确 deterministic layer 只负责硬约束和有限高置信度 safeguard；一般模糊语义和 multi-intent 判断由模型承担。tracked Gateway 默认仍为 DeepSeek 官方 API / `deepseek-v4-flash`；最终本地 Trial 通过被 Git 忽略的 `OPENAI_*` 配置使用 ChatAnywhere / `gpt-5.6-terra`，不改变公开 Demo 的 Mock 默认。

### 2026-08-09 DeepSeek 六类 Web Smoke（早期外部阻塞记录）

- 六条合成 Web Smoke 分两个受控窗口执行，共实际发出四条，每条一次、无重试。第一窗口的第 1、2 条分别约 3.6 秒和 3.5 秒后安全 unavailable；第二窗口的第 3、4 条分别约 0.44 秒和 3.74 秒后安全 unavailable。每个窗口都按“连续两条 unavailable 即停止”执行，因此第 5、6 条未发送，且未切换 Mock。
- 没有返回 Proposal，故标题、分类、日期、nullable 字段和人工语义均未得到验收；该历史窗口的语义 Gate 为 **FAIL / blocked by external generation availability**，当时不可宣称 PR-ready。
- UI 显式提供重新云端与使用本地规则入口，未发生静默回退；客户端安全失败码为 `proposal_unavailable`，在 diagnostics=false 条件下不进一步臆测具体上游 HTTP 状态。未泄露 Key、Prompt 或上游响应。
- 第二窗口的产品级备份计数：Task 5→5、Knowledge 2→2、TaskPlanEvent 5→5、Decision 0→0；仅增加两条失败 Capture，无 Proposal、无 UserDecision / Reducer 写入。
- 监督只读验证 `/models` 与 `/user/balance` 均为 200，目标模型可见且 `is_available=true`。该结果仅排除持续性 Key、余额、模型不可见问题；不能证明生成可用，亦不能精确断言此前 upstream 状态。
- 两个窗口的临时 UI 备份均已删除；8081 与 8787 已释放，相关本轮进程为零，diagnostics=false。

### 2026-08-09 DeepSeek 限量脱敏诊断与继续验收（历史记录）

- 用户授权最多三条真实 Web UI 诊断请求。D1 成功（Gateway/UI 约 12.5/12.8 秒）；D2 在读取完整上游响应体时约 15.0 秒超时，白名单诊断为 `upstream_response / api_adapter / upstream_timeout`，按约定归为 `other`；D3 约 6.8 秒成功。
- D3 因测试动作未先清空失败后保留的输入而形成合成多意图 Capture；模型保守返回未识别，未静默丢项、未生成多个 Proposal。它不能替代独立明确日期案例，但构成保守多意图的补充证据。
- 本窗口没有复现 `proposal_unavailable`，故不能把早期 unavailable 唯一归因于 local/network 或 upstream 5xx；只能确认当前可重复失败是完整响应体超过 15 秒。
- 关闭诊断并重启 Gateway 后，独立明确日期案例约 4.0 秒成功：工作推进、次日本地日期、约 60 分钟和非空下一步均正确。确认前 Today/Calendar 均无正式任务；显式确认后才生成最近决定和次日日历任务，刷新后保留。
- 明确 someday 显式重试和精确多意图案例均约 15.0 秒安全超时。整个窗口共 6 次请求、3 次成功、3 次上游响应超时；未切 Mock、未自动 retry、未调整模型/Prompt/Schema/15 秒 deadline。
- 成功草案严重编造为 0；正式写入仅发生在明确日期案例的 UserDecision 后。结束时 8081/8787 已释放、diagnostics=false、无 Secret/上游正文记录、`CONTRIBUTING.md` 无差异、`git diff --check` 通过。
- 窗口后的完整本地门禁再次通过：typecheck、lint、Jest 72/72、Gateway 45/45、离线 proposal self-test、Playwright 17/17 自然 exit 0、静态导出 7 条路由；E2E runner 清理完成。
- 该 DeepSeek 窗口的语义 Gate 为 **FAIL / external latency blocks semantic completion**：范围日期、明确日期、保守合成多意图和确认持久化已有证据；someday 与精确多意图仍缺少可验收 Proposal。该历史结论已由下方兼容路径 Trial 补齐，不驱动 Prompt、Schema、retry 或 deadline 变更。

### 2026-08-09 ChatAnywhere 兼容路径 Trial（当前最终模型验证）

- 使用现有 Responses API 请求、Prompt v6、Schema v4、Normalizer v2、`high` 和固定 15 秒 deadline，只把被 Git 忽略的本地配置切换为 ChatAnywhere / `gpt-5.6-terra`；没有新增 Provider 层、fallback 或 retry，也没有删除 DeepSeek 支持。
- 固定六条真实 Web Smoke 每条请求一次，结果为 6/6 success、0 timeout。Gateway 平均约 3.49 秒，范围约 2.71～5.15 秒，没有超过 12 秒的边缘请求。
- unknown、范围日期、someday、多意图和明确次日加 60 分钟均符合当前保守语义；严重编造为 0，所有结果通过严格 Schema 与领域组合校验。
- 确认前 Task、Knowledge、TaskPlanEvent 和 Decision 均无增量；用户明确确认一条次日 Proposal 后才由 UserDecision → Reducer 创建正式 Task、Decision 和计划事件，刷新后保留。
- Provider 切换只需要 local config。API Key、`gateway/.dev.vars` 和 DeepSeek 本地备份均未进入 Git；公开 Demo 继续默认 Mock。

### 2026-08-10 v7/v3 限量语义 Smoke（无效样本记录）

- 本地 ignored ChatAnywhere 配置仍可用，diagnostics=false。按最多 8 条的上限发出 8 个请求，均 HTTP 200，Gateway 延迟约 2.9～3.3 秒，且均通过 Schema/领域校验。
- 该窗口不能作为 v7 模型语义证据：Windows PowerShell 向 Node 标准输入传递测试脚本时破坏了中文编码，模型收到问号字符；单任务对照也因此全部返回 conservative unknown。
- 达到 8 条上限后没有更换传输方式重试，也没有为了结果修改 Prompt、Schema 或 normalizer。后续若需要验证 v7 模型语义，应在单独批准的窗口使用 UTF-8 安全输入方式重新执行；不得把本次结果计为通过或失败。
- 结束后 Gateway 已停止，8787 无监听，diagnostics=false；未记录 API Key、原始上游响应或真实用户内容。

## 已知阻塞与合并约束

- 当前基础设施 Gate 已通过：历史 `webServer` 480/124 blocker 已由 PID-owned runner 解决。若出现新的生命周期故障，必须先采集本轮 runner / shell / Expo / Metro PID 树和生命周期日志；不得用忽略退出码、强杀 runner、缩短测试或隐藏进程问题变绿。
- 单次上游 timeout 不能单独驱动 timeout 或 Prompt 变更。
- 历史 Suite H01、S29 与当前 Day 1 范围日期规则存在已记录冲突，历史文件不改写。
- 合并必须走 PR、CI 绿色，禁止直接 push `main`；合并前复核本说明、完整 diff 与必要门禁。
- 当前产品和真实模型 Gate 已完成；下一步只允许最终工程收口、提交当前功能分支并进入 PR Review。不得自动开始长期试用、公网部署或新的产品功能。
