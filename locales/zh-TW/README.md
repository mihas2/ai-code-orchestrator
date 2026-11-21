<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=mihas2.ai-code-orchestrator"><img src="https://img.shields.io/badge/VS_Code_Marketplace-007ACC?style=flat&logo=visualstudiocode&logoColor=white" alt="VS Code Marketplace"></a>
</p>

# AI Code Orchestrator

> 你的 AI 開發團隊，就在編輯器裡。

AI Code Orchestrator 是一個 VS Code 擴充功能與 CLI，可透過可設定的 AI 代理來規劃、實作、審查與解說軟體。它將聊天、程式碼動作、終端機工作流程、自訂角色、MCP 整合與多代理協作整合在同一個工作區中。

## 功能

- 根據自然語言需求產生與修改程式碼
- 規劃架構，並將工作拆分為相互協調的任務
- 以考量相依性的 DAG 協調工作，支援平行執行器、審查階段、預算與受控整合
- **上下文最佳化** - 智慧的上下文管理可在維持效果的同時減少 token 用量與成本
- 審查變更、診斷失敗並改善現有程式碼
- 處理檔案、終端機、圖片與外部 MCP 工具
- 設定供應商（包括 Vercel AI Gateway 與 Unbound）、模型、權限與自訂角色
- 為個別角色指定供應商設定檔與模型；沒有自己模型的角色使用其設定檔的模型，沒有設定檔的角色使用預設設定檔
- 從編輯器或命令列繼續任務

## 角色

AI Code Orchestrator 會配合手邊的工作調整：

- **Code** — 實作變更並操作專案檔案
- **Architect** — 設計系統、規格與遷移
- **Ask** — 回答問題並解說程式碼
- **Debug** — 找出根本原因並驗證修正
- **Reviewer** — 驗證變更、找出問題並確保品質
- **Orchestrator**（預設） — 協調具相依性的任務圖與平行代理
- **Translate** — 翻譯並管理在地化檔案
- **Custom**（選用） — 為團隊建立專門的工作流程

每個角色都可以使用自己的供應商設定檔與模型，於「設定 → 模式」中設定，與「設定 → 供應商」中選取的預設設定檔互不影響。沒有自己模型的角色使用其設定檔的模型，沒有設定檔的角色使用預設設定檔，方便在工作流程中平衡能力、速度與成本。

## 文件

專案文件（包括協作規格）位於 [`apps/docs`](../../apps/docs)。

## 安裝

從 VS Code Marketplace 安裝 **AI Code Orchestrator** 擴充功能，或在本機建置新的 VSIX：

```bash
pnpm install
pnpm rebuild:vsix
```

若要重新建置並以互動方式安裝，請執行 `pnpm install:vsix`。此指令會在打包擴充功能前明確地重新建置 webview。一般的 `pnpm install` 只會安裝相依套件。

開發期間可從 monorepo 使用 CLI：

```bash
pnpm --filter @ai-code-orchestrator/cli dev
```

套件範圍與舊版指令識別碼均予保留，以相容既有的整合。

## 來源

AI Code Orchestrator 以 [Roo Code](https://github.com/RooCodeInc/Roo-Code) 為基礎。實作中保留了部分相容的 API 與識別碼，讓既有的整合能繼續運作。

## 授權

[Apache 2.0](../../LICENSE)
