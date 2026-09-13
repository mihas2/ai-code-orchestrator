<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=mihas2.ai-code-orchestrator"><img src="https://img.shields.io/badge/VS_Code_Marketplace-007ACC?style=flat&logo=visualstudiocode&logoColor=white" alt="VS Code Marketplace"></a>
</p>

# AI Code Orchestrator

> AIを活用した開発チームを、あなたのエディターに。

AI Code Orchestratorは、設定可能なAIエージェントを使ってソフトウェアの計画、実装、レビュー、説明を行うVS Code拡張機能兼CLIです。チャット、コードアクション、ターミナルワークフロー、カスタムロール、MCP連携、マルチエージェントオーケストレーションを1つのワークスペースに統合します。

## 機能

- 自然言語の要件からコードを生成・変更
- アーキテクチャを設計し、作業を連携されたタスクへ分割
- 依存関係を考慮したDAG、並列実行エージェント、レビュー段階、予算、制御された統合による作業のオーケストレーション
- **コンテキスト最適化** — インテリジェントなコンテキスト管理により、効果を維持しながらトークン使用量とコストを削減
- 変更のレビュー、障害の診断、既存コードの改善
- ファイル、ターミナル、画像、外部MCPツールの操作
- Vercel AI GatewayやUnboundを含むプロバイダー、モデル、権限、カスタムロールの設定
- 個々のロールへのモデル割り当てと、上書きがない場合のプライマリモデルからの自動継承
- エディターまたはコマンドラインからタスクを継続

## ロール

AI Code Orchestratorは作業内容に適応します：

- **Code** — 変更の実装とプロジェクトファイルの操作
- **Architect** — システム、仕様、移行の設計
- **Ask** — 質問への回答とコードの説明
- **Debug** — 根本原因の特定と修正の検証
- **Reviewer** — 変更を検証し、問題を特定して品質を確保
- **Orchestrator** — 依存関係を考慮したタスクグラフと並列エージェントの調整（デフォルトロール）
- **Translate** — ローカライゼーションファイルの翻訳と管理
- **Custom** — チーム向けの専門的なワークフローを作成

各ロールには独自のモデル設定を使用できます。ロール固有のモデルが割り当てられていない場合はプライマリモデルを継承するため、ワークフロー全体の能力、速度、コストを簡単に調整できます。

## ドキュメント

オーケストレーション仕様を含むプロジェクトドキュメントは[`apps/docs`](../../apps/docs)を参照してください。

## インストール

VS Code Marketplaceから**AI Code Orchestrator**拡張機能をインストールするか、ローカルでVSIXをビルドします：

```bash
pnpm install
pnpm rebuild:vsix
```

開発時にはモノレポからCLIを利用できます：

```bash
pnpm --filter @ai-code-orchestrator/cli dev
```

既存の連携との互換性を保つため、パッケージスコープと従来のコマンド識別子は維持されています。

## 帰属

AI Code Orchestratorは[Roo Code](https://github.com/RooCodeInc/Roo-Code)を基にしています。既存の連携が引き続き動作するよう、一部の互換APIと識別子を維持しています。

## ライセンス

[Apache 2.0](../../LICENSE)
