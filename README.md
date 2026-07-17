# Reflow

Reflow 是一个面向个人任务执行的移动优先 Demo。它将零散输入整理成可编辑的 Proposal，并串联“捕捉 → 加入今天 → 开始执行 → 记录进展和耗时 → 完成 → 回顾”的完整流程。

当前版本基于 Expo SDK 57、TypeScript、Expo Router、React Native Web 和 AsyncStorage，Web 是第一验收平台，同时保留后续 iOS/Android 复用能力。首版使用确定性的本地 Mock Proposal，不连接真实 AI 或后端。

## 本地运行

```bash
npm install
npm run web
```

终端会输出本地访问地址，通常为 `http://localhost:8081`。

## 验证与导出

```bash
npm run typecheck
npm run lint
npm test
npm run export:web
```

静态站点会输出到 `dist/`。运行时数据只保存在当前浏览器；点击页面左上角的 Reflow 品牌入口可以重置 Demo 数据。

## 页面

- `/`：今天与快速捕捉
- `/inbox`：Proposal 编辑、接受、忽略与撤销
- `/active`：当前任务、进展、耗时和打断
- `/calendar`：月历、日期任务与空档建议
- `/review`：从任务、TimeEntry 和 ProgressLog 派生的日/周/月回顾

详细里程碑和领域规则见 [`docs/implementation-plan.md`](docs/implementation-plan.md)。
