<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=AIOrchestrator.ai-orchestrator"><img src="https://img.shields.io/badge/VS_Code_Marketplace-007ACC?style=flat&logo=visualstudiocode&logoColor=white" alt="VS Code Marketplace"></a>
</p>

# AI Code Orchestrator

> Jouw AI-aangedreven ontwikkelteam, rechtstreeks in je editor.

AI Code Orchestrator is een VS Code-extensie en CLI voor het plannen, implementeren, reviewen en uitleggen van software met configureerbare AI-agents. Het combineert chat, code-acties, terminalworkflows, aangepaste rollen, MCP-integraties en multi-agentorkestratie in één werkruimte.

## Mogelijkheden

- Code genereren en aanpassen vanuit vereisten in natuurlijke taal
- Architectuur plannen en werk opdelen in gecoördineerde taken
- Werk orkestreren als een afhankelijkheidsbewuste DAG met parallelle uitvoerders, reviewfasen, budgetten en gecontroleerde integratie
- **Contextoptimalisatie** — intelligent contextbeheer vermindert tokengebruik en kosten met behoud van effectiviteit
- Wijzigingen reviewen, fouten diagnosticeren en bestaande code verbeteren
- Werken met bestanden, terminals, afbeeldingen en externe MCP-tools
- Providers zoals Vercel AI Gateway en Unbound, modellen, machtigingen en aangepaste rollen configureren
- Modellen toewijzen aan afzonderlijke rollen, met automatische overerving van het primaire model wanneer geen override is ingesteld
- Taken voortzetten vanuit de editor of de opdrachtregel

## Rollen

AI Code Orchestrator past zich aan het werk aan:

- **Code** — wijzigingen implementeren en projectbestanden bewerken
- **Architect** — systemen, specificaties en migraties ontwerpen
- **Ask** — vragen beantwoorden en code uitleggen
- **Debug** — hoofdoorzaken isoleren en oplossingen valideren
- **Reviewer** — wijzigingen valideren, problemen identificeren en kwaliteit waarborgen
- **Orchestrator** — afhankelijkheidsbewuste taakkaarten en parallelle agents coördineren; dit is de standaardrol
- **Custom** — gespecialiseerde workflows voor een team maken

Elke rol kan een eigen modelconfiguratie gebruiken. Als er geen modelspecifieke rol is toegewezen, wordt het primaire model overgenomen. Zo kun je mogelijkheden, snelheid en kosten binnen een workflow eenvoudig balanceren.

## Documentatie

De projectdocumentatie, inclusief de orkestratiespecificatie, staat in [`apps/docs`](../../apps/docs).

## Installatie

Installeer de **AI Code Orchestrator**-extensie vanuit de VS Code Marketplace of bouw lokaal een VSIX:

```bash
pnpm install
pnpm vsix
```

Tijdens de ontwikkeling is de CLI beschikbaar vanuit de monorepo:

```bash
pnpm --filter @ai-code-orchestrator/cli dev
```

De packagescope en legacy-opdracht-ID's blijven behouden voor compatibiliteit met bestaande integraties.

## Naamsvermelding

AI Code Orchestrator is gebaseerd op [Roo Code](https://github.com/RooCodeInc/Roo-Code). De implementatie behoudt geselecteerde compatibele API's en identifiers, zodat bestaande integraties blijven werken.

## Licentie

[Apache 2.0](../../LICENSE)
