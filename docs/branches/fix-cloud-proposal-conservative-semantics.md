# fix/cloud-proposal-conservative-semantics

## 分支目的

收紧本地 Cloud Proposal 的 Day 1 保守语义，确保 AI 只生成待确认的单个 Proposal，且模糊输入、日期范围、延后意图、等待跟进和多行动输入不会被擅自补全。

## 范围

- Prompt、Schema、确定性后处理、Gateway/离线/Web 回归与相关 UI 映射；
- 日期与 nullable 字段的保守规则、历史 Suite 语义边界和 Windows Playwright 生命周期验证；
- 本地 DeepSeek Gateway 的合成 Smoke 与安全失败分类。

## 明确不做

- 不改 DeepSeek Provider、模型、15 秒上游 timeout 或请求白名单；
- 不引入 retry、Agent、工具调用、split 或多 Proposal；
- 不部署公网 Gateway、不做完整 80 条评测或长期真实试用；
- 不提交、push、开 PR 或直接修改 `main`。

## 架构与产品不变量

- 1 Capture 只产生 1 个 `create` Proposal；AI 只有建议权。
- Proposal 在 `pending` 时不写正式数据；只有 UserDecision → Reducer 可以创建任务或知识卡片。
- 范围日期不臆测具体日；未明确的耗时、下一步、跟进日期保持 null。
- Gateway 不读取 Store、Reducer、持久化或既有用户数据；Key 仅存在本地 Gateway 环境。

## 当前验证状态

- 离线自检、Gateway 45 条、Jest 72 条、typecheck、lint 与静态导出均已有通过记录。2026-08-08 的完整 `npm run test:e2e` 运行中，17 条断言全部显示 `ok`，但 Windows 上在第一个 `pw:webserver` 的 `Terminating the WebServer` 后未自然退出，最终被 480 秒外层时限终止（退出码 124）；因此 E2E 不能计为退出码 0 通过。
- 真实 DeepSeek 合成 Smoke：
  - “参赛材料”成功：保守 `unknown`，执行字段和日期均为空；
  - 周末 Agent 资料成功：`learning/task`，bucket/date 为空，60 分钟；
  - 下个月主页在 15 秒上游响应截止时超时；4–6 因失败即停止，未执行。

## 已知阻塞与合并约束

- 当前仍为 FIX REQUIRED：Windows Playwright `webServer` teardown 生命周期阻塞尚未解决。该问题与 17 条断言结果和产品语义分开处理；不得用忽略退出码、强杀 runner、缩短测试或隐藏进程问题变绿。
- 单次上游 timeout 不能单独驱动 timeout 或 Prompt 变更。
- 历史 Suite H01、S29 与当前 Day 1 范围日期规则存在已记录冲突，历史文件不改写。
- 合并必须走 PR、CI 绿色，禁止直接 push `main`；合并前复核本说明、完整 diff 与必要门禁。
