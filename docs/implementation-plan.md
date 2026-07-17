# Reflow 第一版 Web Demo 执行清单

本清单是 `lsc` 分支第一版 Demo 的验收依据。首要目标是打通可刷新保留的个人生产力核心闭环，不让增强功能拖延主流程。

## 完成标准

### 必须完成

- 五个主页面：今天、收件箱、进行中、日历、回顾。
- 核心闭环：捕捉 → Proposal → 编辑后接受 → 加入今天 → 开始执行 → 记录耗时/进展 → 完成 → 回顾更新 → 刷新保留。
- 领域数据与 UI 瞬时状态分离，Review 从任务、时间和进展事实派生。
- AsyncStorage 持久化、数据版本校验和一键重置。
- 手机与桌面浏览器移动优先适配。
- Reducer、Mock Proposal、统计、持久化单测和一条核心流程 E2E。
- Web 静态导出成功。

### 加分项

- Web 拖拽排序；稳定的上移/下移排序是首版 fallback。
- 更完整的日/周视图。
- 知识卡片、额外动画和更多 E2E。

## 领域规则

- `TaskCategory`：工作推进、沟通跟进、学习研究、生活事务、健康、未识别。
- `TaskStatus`：未开始、进行中、已完成。
- `WorkflowBucket`：收件箱、今天、等待他人、稍后处理、归档。
- `CaptureOutcome`：任务、知识沉淀、忽略。
- 同一时间最多只有一个进行中任务。
- 等待他人和稍后处理是接受 Proposal 后的工作流去向；忽略才是拒绝 Proposal。
- 领域动作使用 `startTask`、`pauseTask`、`completeTask`、`moveTask`、`recordTime`、`recordProgress`、`recordInterruption`、`scheduleTask`、`deleteTask`。
- Mock Proposal 对相同文本生成相同结果，不使用随机数，不声称是真实 AI。

## 里程碑

- [x] **M0 仓库与 Expo 初始化**：`lsc` 分支、SDK 57、TypeScript、Router、依赖、脚本和本清单。
- [x] **M1 五页高保真静态 UI**：移动优先应用外壳、统一设计系统、五页与基础弹层。
- [x] **M2 模型、Reducer、Selector 与持久化**：领域模型、确定性 Mock、派生统计、AsyncStorage 数据版本与重置。
- [x] **M3 完整核心闭环**：从捕捉到回顾更新，包含单一当前任务、耗时和进展记录。
- [x] **M4 增强**：月历、选择日期、空档建议、等待他人、稍后处理、编辑后接受和撤销。
- [ ] **M5 验证与发布准备**：优先单测、单条核心 E2E、静态导出、GitHub Pages/Actions、README。

## 安全边界

- 所有开发只进入 `lsc`；不 force push、不重写 `main`。
- 不删除已有产品参考文件。
- 首版不接真实 AI、账号、后端、邮件、飞书或系统日历。
- 持久化只保存领域数据，不保存弹窗、loading、toast、当前 Tab 等 UI 状态。
