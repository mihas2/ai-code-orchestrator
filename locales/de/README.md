<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=AIOrchestrator.ai-orchestrator"><img src="https://img.shields.io/badge/VS_Code_Marketplace-007ACC?style=flat&logo=visualstudiocode&logoColor=white" alt="VS Code Marketplace"></a>
</p>

# AI Code Orchestrator

> Dein KI-gestütztes Entwicklungsteam – direkt in deinem Editor.

AI Code Orchestrator ist eine VS-Code-Erweiterung und CLI zum Planen, Implementieren, Prüfen und Erklären von Software mit konfigurierbaren KI-Agenten. Es vereint Chat, Code-Aktionen, Terminal-Workflows, benutzerdefinierte Rollen, MCP-Integrationen und Multi-Agenten-Orchestrierung in einem Arbeitsbereich.

## Funktionen

- Code aus natürlichsprachlichen Anforderungen erzeugen und ändern
- Architekturen planen und Arbeit in koordinierte Aufgaben aufteilen
- Arbeit als abhängigkeitsbewussten DAG mit parallelen Ausführenden, Review-Phasen, Budgets und kontrollierter Integration orchestrieren
- **Kontextoptimierung** – intelligentes Kontextmanagement reduziert Tokenverbrauch und Kosten bei gleichbleibender Effektivität
- Änderungen prüfen, Fehler diagnostizieren und bestehenden Code verbessern
- Mit Dateien, Terminals, Bildern und externen MCP-Werkzeugen arbeiten
- Anbieter wie Vercel AI Gateway und Unbound sowie Modelle, Berechtigungen und benutzerdefinierte Rollen konfigurieren
- Modelle einzelnen Rollen zuweisen; ohne Überschreibung wird automatisch das primäre Modell geerbt
- Aufgaben im Editor oder über die Befehlszeile fortsetzen

## Rollen

AI Code Orchestrator passt sich der jeweiligen Aufgabe an:

- **Code** – Änderungen implementieren und Projektdateien bearbeiten
- **Architect** – Systeme, Spezifikationen und Migrationen entwerfen
- **Ask** – Fragen beantworten und Code erklären
- **Debug** – Ursachen isolieren und Korrekturen validieren
- **Reviewer** – Änderungen validieren, Probleme identifizieren und Qualität sicherstellen
- **Orchestrator** – abhängigkeitsbewusste Aufgabengraphen und parallele Agenten koordinieren; dies ist der Standardrolle
- **Custom** – spezialisierte Arbeitsabläufe für ein Team erstellen

Jede Rolle kann eine eigene Modellkonfiguration verwenden. Ist kein rollenspezifisches Modell zugewiesen, wird das primäre Modell geerbt. So lassen sich Leistungsfähigkeit, Geschwindigkeit und Kosten eines Workflows einfach ausbalancieren.

## Dokumentation

Die Projektdokumentation einschließlich der Orchestrierungsspezifikation befindet sich unter [`apps/docs`](../../apps/docs).

## Installation

Installiere die Erweiterung **AI Code Orchestrator** aus dem VS Code Marketplace oder erstelle lokal eine VSIX-Datei:

```bash
pnpm install
pnpm vsix
```

Während der Entwicklung ist die CLI aus dem Monorepo verfügbar:

```bash
pnpm --filter @ai-code-orchestrator/cli dev
```

Der Paket-Scope und ältere Befehlskennungen bleiben zur Kompatibilität mit bestehenden Integrationen erhalten.

## Danksagung

AI Code Orchestrator basiert auf [Roo Code](https://github.com/RooCodeInc/Roo-Code). Die Implementierung behält ausgewählte kompatible APIs und Kennungen bei, damit bestehende Integrationen weiterhin funktionieren.

## Lizenz

[Apache 2.0](../../LICENSE)
