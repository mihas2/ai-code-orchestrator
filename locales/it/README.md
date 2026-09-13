<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=mihas2.ai-code-orchestrator"><img src="https://img.shields.io/badge/VS_Code_Marketplace-007ACC?style=flat&logo=visualstudiocode&logoColor=white" alt="VS Code Marketplace"></a>
</p>
# AI Code Orchestrator

> Il tuo team di sviluppo con IA, direttamente nel tuo editor

<details>
  <summary>🌐 Lingue disponibili</summary>

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

## Cosa può fare AI Code Orchestrator per TE?

- Generare codice da descrizioni in linguaggio naturale
- Adattarsi con le Modalità: Codice, Architetto, Chiedi, Debug e Modalità Personalizzate
- Refactoring e debug di codice esistente
- Scrivere e aggiornare la documentazione
- Rispondere a domande sulla tua codebase
- Automatizzare attività ripetitive
- Utilizzare server MCP

## Modalità

AI Code Orchestrator si adatta al tuo modo di lavorare, non il contrario:

- Modalità Codice: codifica quotidiana, modifiche e operazioni sui file
- Modalità Architetto: pianifica sistemi, specifiche e migrazioni
- Modalità Chiedi: risposte rapide, spiegazioni e documenti
- Modalità Debug: traccia problemi, aggiungi log, isola le cause principali
- Modalità Traduzione: traduci e gestisci i file di localizzazione
- Modalità Personalizzate: crea modalità specializzate per il tuo team o flusso di lavoro

Scopri di più: [Usare le Modalità](https://github.com/mihas2/ai-code-orchestrator/basic-usage/using-modes) • [Modalità personalizzate](https://github.com/mihas2/ai-code-orchestrator/advanced-usage/custom-modes)

## Risorse

- **[Documentazione](https://github.com/mihas2/ai-code-orchestrator):** La guida ufficiale per installare, configurare e padroneggiare AI Code Orchestrator.
- **[Problemi GitHub](https://github.com/AIOrchestrator/ai-code-orchestrator/issues):** Segnala bug e tieni traccia dello sviluppo.

---

## Dichiarazione di non responsabilità

**Si prega di notare** che AI Code Orchestrator, Inc. **non** rilascia alcuna dichiarazione o garanzia in merito a qualsiasi codice, modello o altro strumento fornito o reso disponibile in connessione con AI Code Orchestrator, qualsiasi strumento di terze parti associato o qualsiasi output risultante. L'utente si assume **tutti i rischi** associati all'uso di tali strumenti o output; tali strumenti sono forniti **"COSÌ COME SONO"** e **"COME DISPONIBILI"**. Tali rischi possono includere, a titolo esemplificativo, violazione della proprietà intellettuale, vulnerabilità o attacchi informatici, parzialità, imprecisioni, errori, difetti, virus, tempi di inattività, perdita o danneggiamento di proprietà e/o lesioni personali. L'utente è l'unico responsabile dell'uso di tali strumenti o output (inclusi, a titolo esemplificativo, la loro legalità, adeguatezza e risultati).

---

## Installazione

Installa l'estensione **AI Code Orchestrator** dal VS Code Marketplace, o ricostruisci un VSIX localmente:

```bash
pnpm install
pnpm rebuild:vsix
```

Per ricostruire e poi installarla in modo interattivo, esegui `pnpm install:vsix`. Questo ricostruisce esplicitamente la webview prima di raggruppare e imballare l'estensione. Un normale `pnpm install` installa solo le dipendenze.

Durante lo sviluppo, la CLI è disponibile dal monorepo:

```bash
pnpm --filter @ai-code-orchestrator/cli dev
```

Lo scope del pacchetto e gli identificatori di comando obsoleti sono mantenuti per mantenere la compatibilità con le integrazioni esistenti.

## Licenza

[Apache 2.0 © 2025 AI Code Orchestrator, Inc.](../../LICENSE)
