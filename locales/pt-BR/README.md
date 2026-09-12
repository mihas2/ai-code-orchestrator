<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=AIOrchestrator.ai-orchestrator"><img src="https://img.shields.io/badge/VS_Code_Marketplace-007ACC?style=flat&logo=visualstudiocode&logoColor=white" alt="VS Code Marketplace"></a>
  <a href="https://x.com/AI Code Orchestrator"><img src="https://img.shields.io/badge/AI Code Orchestrator-000000?style=flat&logo=x&logoColor=white" alt="X"></a>
</p>
# AI Code Orchestrator

> Seu time de desenvolvimento com IA, direto no seu editor

<details>
  <summary>🌐 Idiomas disponíveis</summary>

- [English](../../README.md)
- [Català](../ca/README.md)
- [Deutsch](../de/README.md)
- [Español](../es/README.md)
- [Français](../fr/README.md)
- [हिंदी](../hi/README.md)
- [Bahasa Indonesia](../id/README.md)
- [Italiano](../it/README.md)
- [日本語](../ja/README.md)
- [한국어](../ko/README.md)
- [Nederlands](../nl/README.md)
- [Polski](../pl/README.md)
- [Português (BR)](../pt-BR/README.md)
- [Русский](../ru/README.md)
- [Türkçe](../tr/README.md)
- [Tiếng Việt](../vi/README.md)
- [简体中文](../zh-CN/README.md)
- [繁體中文](../zh-TW/README.md)
- ...
      </details>

---

## O que o AI Code Orchestrator pode fazer por VOCÊ?

- Gerar código a partir de descrições em linguagem natural
- Adapte-se com os Modos: Código, Arquiteto, Pergunta, Depuração e Modos Personalizados
- Refatorar e depurar código existente
- Escrever e atualizar documentação
- Responder a perguntas sobre sua base de código
- Automatizar tarefas repetitivas
- Utilizar servidores MCP

## Modos

O AI Code Orchestrator se adapta à sua maneira de trabalhar, e não o contrário:

- Modo Código: codificação diária, edições e operações de arquivo
- Modo Arquiteto: planeje sistemas, especificações e migrações
- Modo Pergunta: respostas rápidas, explicações e documentos
- Modo Depuração: rastreie problemas, adicione logs, isole as causas raiz
- Modo Tradução: traduza e gerencie arquivos de localização
- Modos Personalizados: crie modos especializados para sua equipe ou fluxo de trabalho

Saiba mais: [Usar Modos](https://aiorchestrator.github.io/ai-code-orchestrator/basic-usage/using-modes) • [Modos personalizados](https://aiorchestrator.github.io/ai-code-orchestrator/advanced-usage/custom-modes)

## Recursos

- **[Documentação](https://aiorchestrator.github.io/ai-code-orchestrator/):** O guia oficial para instalar, configurar e dominar o AI Code Orchestrator.
- **[Issues do GitHub](https://github.com/AIOrchestrator/ai-code-orchestrator/issues):** Relate bugs e acompanhe o desenvolvimento.

---

## Isenção de responsabilidade

**Observe** que a AI Code Orchestrator, Inc. **não** faz representações ou garantias em relação a qualquer código, modelos ou outras ferramentas fornecidas ou disponibilizadas em conexão com o AI Code Orchestrator, quaisquer ferramentas de terceiros associadas ou quaisquer saídas resultantes. Você assume **todos os riscos** associados ao uso de tais ferramentas ou saídas; tais ferramentas são fornecidas **"COMO ESTÃO"** e **"CONFORME DISPONÍVEIS"**. Tais riscos podem incluir, sem limitação, violação de propriedade intelectual, vulnerabilidades ou ataques cibernéticos, viés, imprecisões, erros, defeitos, vírus, tempo de inatividade, perda ou dano de propriedade e/ou lesões pessoais. Você é o único responsável pelo uso de tais ferramentas ou saídas (incluindo, sem limitação, a legalidade, adequação e resultados das mesmas).

---

## Instalação

Instale a extensão **AI Code Orchestrator** do VS Code Marketplace, ou reconstrua um VSIX localmente:

```bash
pnpm install
pnpm rebuild:vsix
```

Para reconstruir e instalar interativamente, execute `pnpm install:vsix`. Isso reconstrói explicitamente a webview antes de empacotar e empacotar a extensão. Um `pnpm install` normal só instala dependências.

Durante o desenvolvimento, a CLI está disponível a partir do monorepo:

```bash
pnpm --filter @ai-code-orchestrator/cli dev
```

O escopo do pacote e os identificadores de comando legados são mantidos para manter a compatibilidade com as integrações existentes.

## Licença

[Apache 2.0 © 2025 AI Code Orchestrator, Inc.](../../LICENSE)
