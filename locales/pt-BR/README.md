<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=mihas2.ai-code-orchestrator"><img src="https://img.shields.io/badge/VS_Code_Marketplace-007ACC?style=flat&logo=visualstudiocode&logoColor=white" alt="VS Code Marketplace"></a>
</p>

# AI Code Orchestrator

> Sua equipe de desenvolvimento com IA, direto no seu editor.

AI Code Orchestrator é uma extensão do VS Code e uma CLI para planejar, implementar, revisar e explicar software com agentes de IA configuráveis. Ela reúne chat, ações de código, fluxos de trabalho no terminal, funções personalizadas, integrações MCP e orquestração multiagente em um só espaço de trabalho.

## Recursos

- Gerar e modificar código a partir de requisitos em linguagem natural
- Planejar a arquitetura e dividir o trabalho em tarefas coordenadas
- Orquestrar o trabalho como um DAG com dependências, executores em paralelo, etapas de revisão, orçamentos e integração controlada
- **Otimização de contexto** - o gerenciamento inteligente de contexto reduz o uso de tokens e os custos sem perder eficácia
- Revisar alterações, diagnosticar falhas e melhorar o código existente
- Trabalhar com arquivos, terminais, imagens e ferramentas MCP externas
- Configurar provedores, incluindo Vercel AI Gateway e Unbound, modelos, permissões e funções personalizadas
- Atribuir um perfil de provedor e um modelo a cada função; uma função sem modelo próprio usa o modelo do seu perfil, e uma função sem perfil usa o perfil padrão
- Continuar tarefas pelo editor ou pela linha de comando

## Funções

O AI Code Orchestrator se adapta ao trabalho em andamento:

- **Code** — implementar alterações e trabalhar com os arquivos do projeto
- **Architect** — projetar sistemas, especificações e migrações
- **Ask** — responder perguntas e explicar código
- **Debug** — isolar causas raiz e validar correções
- **Reviewer** — validar alterações, identificar problemas e garantir a qualidade
- **Orchestrator** (padrão) — coordenar grafos de tarefas com dependências e agentes em paralelo
- **Translate** — traduzir e gerenciar arquivos de localização
- **Custom** (opcional) — criar fluxos de trabalho especializados para uma equipe

Cada função pode usar seu próprio perfil de provedor e modelo, definidos em Configurações → Modos independentemente do perfil padrão selecionado em Configurações → Provedores. Uma função sem modelo próprio usa o modelo do seu perfil, e uma função sem perfil usa o perfil padrão, o que facilita equilibrar capacidade, velocidade e custo em um fluxo de trabalho.

## Documentação

Consulte a documentação do projeto, incluindo a especificação de orquestração, em [`apps/docs`](../../apps/docs).

## Instalação

Instale a extensão **AI Code Orchestrator** pelo VS Code Marketplace ou gere um novo VSIX localmente:

```bash
pnpm install
pnpm rebuild:vsix
```

Para recompilar e depois instalar de forma interativa, execute `pnpm install:vsix`. Isso recompila explicitamente a webview antes de empacotar a extensão. Um `pnpm install` comum apenas instala as dependências.

Durante o desenvolvimento, a CLI está disponível a partir do monorepo:

```bash
pnpm --filter @ai-code-orchestrator/cli dev
```

O escopo do pacote e os identificadores de comandos antigos são mantidos para compatibilidade com as integrações existentes.

## Atribuição

O AI Code Orchestrator é baseado no [Roo Code](https://github.com/RooCodeInc/Roo-Code). A implementação mantém algumas APIs e identificadores compatíveis para que as integrações existentes continuem funcionando.

## Licença

[Apache 2.0](../../LICENSE)
