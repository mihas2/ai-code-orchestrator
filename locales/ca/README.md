<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=AIOrchestrator.ai-orchestrator"><img src="https://img.shields.io/badge/VS_Code_Marketplace-007ACC?style=flat&logo=visualstudiocode&logoColor=white" alt="VS Code Marketplace"></a>
</p>

# AI Code Orchestrator

> El teu equip de desenvolupament impulsat per IA, directament al teu editor.

AI Code Orchestrator és una extensió de VS Code i una CLI per planificar, implementar, revisar i explicar programari amb agents d'IA configurables. Combina xat, accions de codi, fluxos de treball del terminal, rols personalitzats, integracions MCP i orquestració multiagent en un sol espai de treball.

## Funcionalitats

- Generar i modificar codi a partir de requisits en llenguatge natural
- Planificar l'arquitectura i dividir el treball en tasques coordinades
- Orquestrar el treball com un DAG conscient de les dependències, amb executors paral·lels, fases de revisió, pressupostos i integració controlada
- **Optimització del context** — la gestió intel·ligent del context redueix l'ús de tokens i els costos sense perdre efectivitat
- Revisar canvis, diagnosticar errors i millorar el codi existent
- Treballar amb fitxers, terminals, imatges i eines MCP externes
- Configurar proveïdors com Vercel AI Gateway i Unbound, models, permisos i rols personalitzats
- Assignar models a rols individuals, amb herència automàtica del model principal si no es configura cap substitució
- Continuar les tasques des de l'editor o la línia d'ordres

## Rols

AI Code Orchestrator s'adapta a la feina que tens entre mans:

- **Code** — implementar canvis i treballar amb els fitxers del projecte
- **Architect** — dissenyar sistemes, especificacions i migracions
- **Ask** — respondre preguntes i explicar codi
- **Debug** — aïllar les causes arrel i validar les correccions
- **Reviewer** — validar els canvis, identificar problemes i garantir la qualitat
- **Orchestrator** — coordinar gràfics de tasques amb dependències i agents paral·lels; és el rol predeterminat
- **Custom** — crear fluxos de treball especialitzats per a un equip

Cada rol pot utilitzar la seva pròpia configuració de model. Quan no s'assigna cap model específic al rol, hereta el model principal, cosa que facilita equilibrar capacitat, velocitat i cost.

## Documentació

La documentació del projecte, inclosa l'especificació d'orquestració, és a [`apps/docs`](../../apps/docs).

## Instal·lació

Instal·la l'extensió **AI Code Orchestrator** des del VS Code Marketplace o crea un VSIX localment:

```bash
pnpm install
pnpm rebuild:vsix
```

Durant el desenvolupament, la CLI està disponible des del monorepo:

```bash
pnpm --filter @ai-code-orchestrator/cli dev
```

L'àmbit dels paquets i els identificadors d'ordres antics es conserven per mantenir la compatibilitat amb les integracions existents.

## Atribució

AI Code Orchestrator es basa en [Roo Code](https://github.com/RooCodeInc/Roo-Code). La implementació conserva algunes API i identificadors compatibles perquè les integracions existents continuïn funcionant.

## Llicència

[Apache 2.0](../../LICENSE)
