<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=AIOrchestrator.ai-orchestrator"><img src="https://img.shields.io/badge/VS_Code_Marketplace-007ACC?style=flat&logo=visualstudiocode&logoColor=white" alt="VS Code Marketplace"></a>
</p>

# AI Code Orchestrator

> 你的 AI 驱动开发团队，就在你的编辑器里。

AI Code Orchestrator 是一个 VS Code 扩展和 CLI，借助可配置的 AI 代理规划、实现、审查和解释软件。它将聊天、代码操作、终端工作流、自定义角色、MCP 集成和多代理编排整合到一个工作区中。

## 功能

- 根据自然语言需求生成和修改代码
- 规划架构，并将工作拆分为协调任务
- 以依赖感知的 DAG 编排工作，支持并行执行器、审查阶段、预算和受控集成
- **上下文优化** — 智能上下文管理在保持效能的同时减少令牌用量和成本
- 审查变更、诊断故障并改进现有代码
- 使用文件、终端、图像和外部 MCP 工具
- 配置包括 Vercel AI Gateway 和 Unbound 在内的提供商、模型、权限和自定义角色
- 为各个角色分配模型；未配置覆盖时自动继承主模型
- 从编辑器或命令行继续任务

## 角色

AI Code Orchestrator 会适应当前工作：

- **Code** — 实现变更并操作项目文件
- **Architect** — 设计系统、规范和迁移方案
- **Ask** — 回答问题并解释代码
- **Debug** — 定位根本原因并验证修复
- **Reviewer** — 验证变更、识别问题并确保质量
- **Orchestrator** — 协调依赖感知的任务图和并行代理；这是默认角色
- **Custom** — 为团队创建专用工作流

每个角色都可以使用独立的模型配置。如果没有指定角色模型，就会继承主模型，便于在工作流中平衡能力、速度和成本。

## 文档

项目文档（包括编排规范）位于 [`apps/docs`](../../apps/docs)。

## 安装

从 VS Code Marketplace 安装 **AI Code Orchestrator** 扩展，或在本地构建 VSIX：

```bash
pnpm install
pnpm vsix
```

开发期间可从 monorepo 使用 CLI：

```bash
pnpm --filter @ai-code-orchestrator/cli dev
```

为兼容现有集成，包作用域和旧版命令标识符会继续保留。

## 归属

AI Code Orchestrator 基于 [Roo Code](https://github.com/RooCodeInc/Roo-Code) 构建。实现保留了部分兼容 API 和标识符，以确保现有集成继续运行。

## 许可证

[Apache 2.0](../../LICENSE)
