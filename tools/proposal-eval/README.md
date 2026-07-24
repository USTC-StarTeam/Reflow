# Reflow P0 云端 Proposal 评测工具

该目录只用于验证一个真实 OpenAI 模型通过指定 API Provider 生成 Proposal 的能力，不参与 Reflow 产品运行，不访问浏览器中的任务、日历、日志或备份。

## 固定配置

- 48 条合成输入；
- 32 条常规案例各运行一次；
- 16 条困难案例各运行三次；
- 共 80 次请求；
- 固定日期 `2026-07-24`；
- 固定时区 `Asia/Shanghai`；
- 默认模型 `gpt-5.6-terra`；
- 默认推理强度 `high`；
- Responses API、Structured Outputs、非流式、`store: false`。

Prompt、Schema、模型和推理强度都会写入 `manifest.json` 和每条运行记录。修改 Prompt 或 Schema 时必须同步更新 `lib.mjs` 中的版本号。

## 安全配置

API Key 只能保存在当前终端环境变量或被 Git 忽略的本地环境文件中。不要把 Key：

- 写入本目录文件；
- 写入 Git；
- 粘贴到聊天；
- 放入 `EXPO_PUBLIC_*`；
- 输出到日志。

PowerShell 当前会话示例：

```powershell
$env:OPENAI_API_KEY = '在本机填写'
```

关闭终端后，该会话变量即失效。

### ChatAnywhere 配置

当前 P0 使用 ChatAnywhere 的 OpenAI 兼容 Responses API。用户级变量为：

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
--model gpt-5.6-terra
--reasoning high
--timeout-ms 30000
--max-output-tokens 4096
--case H13
--cases S01,S11,S26,S28,H05,H10,H15
--limit 5
--output artifacts/proposal-eval/custom
--input-price 5
--output-price 30
--cost-currency USD
--provider openai
--base-url https://api.openai.com/v1
--responses-url https://api.openai.com/v1/responses
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
