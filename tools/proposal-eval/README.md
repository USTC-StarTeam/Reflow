# Reflow P0 云端 Proposal 评测工具

该目录只用于验证一个真实 Responses API 模型通过指定 API Provider 生成 Proposal 的能力，不参与 Reflow 产品运行，不访问浏览器中的任务、日历、日志或备份。

## 固定配置

- 48 条合成输入；
- 32 条常规案例各运行一次；
- 16 条困难案例各运行三次；
- 共 80 次请求；
- 固定日期 `2026-07-24`；
- 固定时区 `Asia/Shanghai`；
- 默认官方 Base URL `https://api.deepseek.com`；
- 默认模型 `deepseek-v4-flash`；
- 默认推理强度 `high`；
- 默认成本估算：非缓存输入 `$0.14`、输出 `$0.28` / 百万 Tokens；
- Responses API、Structured Outputs、非流式、`store: false`。

Prompt、Schema、模型和推理强度都会写入 `manifest.json` 和每条运行记录。修改 Prompt 或 Schema 时必须同步更新 `lib.mjs` 中的版本号。

> 历史 Suite 的结构仍用于归档评测，但其旧日期预期不等同于当前产品规则：H01 曾将“月底前完成暑期项目中期汇报”期望为月末具体日期，S29 曾将“下周再整理以前的项目归档”期望为 `someday`。当前 Day 1 v7/v4/v3 对这两种只有范围、没有唯一日期的表达均使用 `suggestedBucket=null`、`suggestedDate=null`。v7/v3 进一步明确：模型负责模糊名词和一般 multi-intent 语义，确定性层只负责合同硬约束、唯一日期和有限高置信度 safeguard。`validateSuite` 和 `buildJobs` 只验证历史 Suite 结构及其 80 个作业，不验证旧预期符合当前语义。

DeepSeek 默认价格是当前官方非缓存价格，仅用于本地估算，Provider 可能随时调整。评测当前没有单独建模缓存命中折扣，因此输入统一按非缓存价格做保守估算；正式运行前仍应核对最新价格，并可用 `--input-price` / `--output-price` 显式覆盖。旧 `OPENAI_*` 兼容路径继续保留历史默认 `5` / `30`，避免改变旧评测行为。

## 安全配置

API Key 只能保存在当前终端环境变量或被 Git 忽略的本地环境文件中。不要把 Key：

- 写入本目录文件；
- 写入 Git；
- 粘贴到聊天；
- 放入 `EXPO_PUBLIC_*`；
- 输出到日志。

PowerShell 当前会话示例：

```powershell
$env:DEEPSEEK_API_KEY = '在本机填写'
```

关闭终端后，该会话变量即失效。

DeepSeek 官方 [Responses API 指南](https://api-docs.deepseek.com/guides/responses_api/) 当前只支持 `deepseek-v4-flash`。不要使用已经退役的 `deepseek-chat` 或 `deepseek-reasoner`，也不要把本评测切到 Chat Completions。可选变量与 Gateway 一致：

```powershell
$env:DEEPSEEK_BASE_URL = 'https://api.deepseek.com'
$env:DEEPSEEK_MODEL = 'deepseek-v4-flash'
$env:DEEPSEEK_REASONING_EFFORT = 'high'
```

需要直接覆盖 endpoint 时才设置 `DEEPSEEK_RESPONSES_URL`。只要存在任一 `DEEPSEEK_*` 变量，评测工具就不会混入旧的 `OPENAI_*` 用户环境配置。完全没有 `DEEPSEEK_*` 时，旧 `OPENAI_API_KEY`、`OPENAI_BASE_URL` / `OPENAI_API_BASE`、`OPENAI_RESPONSES_URL`、`OPENAI_MODEL` 和 `OPENAI_REASONING_EFFORT` 仍兼容。

### 历史 ChatAnywhere 配置

2026-07-24 的已归档 P0 使用 ChatAnywhere 的 OpenAI 兼容 Responses API。若需要复现旧评测，且当前环境中不存在任何 `DEEPSEEK_*` 变量，可继续使用原有用户级变量：

```powershell
[Environment]::SetEnvironmentVariable('OPENAI_API_BASE', 'https://api.chatanywhere.tech/v1', 'User')
[Environment]::SetEnvironmentVariable('OPENAI_RESPONSES_URL', 'https://api.chatanywhere.tech/v1/responses', 'User')
[Environment]::SetEnvironmentVariable('OPENAI_MODEL', 'gpt-5.6-terra', 'User')
[Environment]::SetEnvironmentVariable('OPENAI_REASONING_EFFORT', 'high', 'User')
[Environment]::SetEnvironmentVariable('REFLOW_EVAL_PROVIDER', 'chatanywhere', 'User')
[Environment]::SetEnvironmentVariable('REFLOW_EVAL_COST_CURRENCY', 'CNY', 'User')
[Environment]::SetEnvironmentVariable('REFLOW_EVAL_INPUT_PRICE', '17.5', 'User')
[Environment]::SetEnvironmentVariable('REFLOW_EVAL_OUTPUT_PRICE', '105', 'User')
```

价格单位是 CNY/百万 Tokens，来自执行评测时的 ChatAnywhere 价格表。Provider、Host、货币和价格都会写入评测 Manifest。第三方价格和模型路由可能变化，正式运行前必须重新核对。

## 离线检查

不调用 API：

```powershell
node tools/proposal-eval/run.mjs --dry-run
```

评测工具自身的离线回归：

```powershell
node tools/proposal-eval/self-test.mjs
```

输出应包含：

```text
uniqueCases: 48
standardCases: 32
hardCases: 16
injectionCases: 4
totalPlannedRequests: 80
```

## 小规模 Smoke Test

正式执行 80 次前，先调用一个合成案例：

```powershell
node tools/proposal-eval/run.mjs --case S01 --output artifacts/proposal-eval/smoke
node tools/proposal-eval/score.mjs --input artifacts/proposal-eval/smoke/runs.jsonl
```

确认模型权限、Responses API、Structured Outputs 和费用记录正常后，再运行完整评测。

## 完整 P0

```powershell
node tools/proposal-eval/run.mjs
```

脚本逐条写入 `runs.jsonl`。如果中途中断，可使用原输出目录继续：

```powershell
node tools/proposal-eval/run.mjs --output artifacts/proposal-eval/<原目录>
```

完成后评分：

```powershell
node tools/proposal-eval/score.mjs --input artifacts/proposal-eval/<目录>/runs.jsonl
```

评分器会生成：

```text
manifest.json
runs.jsonl
human-review.json
summary.json
report.md
```

## 人工复核

第一次评分会生成 `human-review.json`。逐条填写：

- 标题 1–5 分；
- 下一步行动 1–5 分，知识结果可为 `null`；
- 所需修改次数；
- 是否严重编造；
- 是否发生 Prompt 注入突破；
- 简短备注。

完成后重新运行评分命令，才会得到：

- 通过；
- 有条件通过；
- 不通过。

人工复核未完成时，报告只能标记为“待人工复核”。

## 常用参数

```text
--model deepseek-v4-flash
--reasoning high
--timeout-ms 30000
--max-output-tokens 4096
--case H13
--cases S01,S11,S26,S28,H05,H10,H15
--limit 5
--output artifacts/proposal-eval/custom
--input-price 0.14
--output-price 0.28
--cost-currency USD
--provider deepseek
--base-url https://api.deepseek.com
--responses-url https://api.deepseek.com/responses
```

价格参数单位为“指定货币 / 百万 Tokens”，用于估算，不替代 Provider 实际账单。运行前应根据当前账户价格核对。

## 工具边界

该评测工具本身不会：

- 修改 Reflow `src`；
- 创建正式任务或知识卡片；
- 实现 CloudProposalService；
- 部署 Gateway；
- 修改 GitHub Pages；
- 自动进入 P1。

2026-07-24 的最终评测使用 `gpt-5.6-terra + high`、Prompt
`reflow-proposal-final-v5`、Schema `reflow-cloud-proposal-draft-v3` 和确定性日期
归一化 `reflow-proposal-date-normalizer-v1`。48 条唯一案例共运行 80 次，最终结论为
“通过”：

- Schema、领域组合、Category、Outcome 和 Bucket 均为 100%；
- 可合理估时的 57 次输出全部返回 5～480 分钟的合法整数；
- 不应强行估时的 23 次输出全部保持 `null`；
- 严重编造、Prompt 注入突破和内部名称泄漏均为 0；
- 93.8% 的结果可直接使用或只需一次轻微修改。

P0 已收尾，仓库中的 P1 本地开发链路已经实现
`CloudProposalService → local Gateway → Responses API`。评测工具仍保持独立，不参与
产品运行。完整数据与日期后处理说明见
[`docs/cloud-proposal-evaluation.md`](../../docs/cloud-proposal-evaluation.md)，实现状态见
[`docs/cloud-proposal-plan.md`](../../docs/cloud-proposal-plan.md)。
