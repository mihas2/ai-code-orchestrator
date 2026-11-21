<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=mihas2.ai-code-orchestrator"><img src="https://img.shields.io/badge/VS_Code_Marketplace-007ACC?style=flat&logo=visualstudiocode&logoColor=white" alt="VS Code Marketplace"></a>
</p>

# AI Code Orchestrator

> Il tuo team di sviluppo basato sull'IA, direttamente nel tuo editor.

AI Code Orchestrator è un'estensione di VS Code e una CLI per pianificare, implementare, revisionare e spiegare software con agenti IA configurabili. Riunisce chat, azioni sul codice, flussi di lavoro nel terminale, ruoli personalizzati, integrazioni MCP e orchestrazione multi-agente in un unico spazio di lavoro.

## Funzionalità

- Generare e modificare codice a partire da requisiti in linguaggio naturale
- Progettare l'architettura e suddividere il lavoro in attività coordinate
- Orchestrare il lavoro come un DAG che tiene conto delle dipendenze, con esecutori paralleli, fasi di revisione, budget e integrazione controllata
- **Ottimizzazione del contesto**: una gestione intelligente del contesto riduce l'uso di token e i costi mantenendo l'efficacia
- Revisionare le modifiche, diagnosticare i problemi e migliorare il codice esistente
- Lavorare con file, terminali, immagini e strumenti MCP esterni
- Configurare i fornitori, inclusi Vercel AI Gateway e Unbound, i modelli, i permessi e i ruoli personalizzati
- Assegnare un profilo di fornitore e un modello ai singoli ruoli; un ruolo senza un modello proprio usa il modello del suo profilo, e un ruolo senza profilo usa il profilo predefinito
- Riprendere le attività dall'editor o dalla riga di comando

## Ruoli

AI Code Orchestrator si adatta al lavoro da svolgere:

- **Code** — implementare le modifiche e lavorare sui file del progetto
- **Architect** — progettare sistemi, specifiche e migrazioni
- **Ask** — rispondere alle domande e spiegare il codice
- **Debug** — isolare le cause principali e verificare le correzioni
- **Reviewer** — validare le modifiche, individuare i problemi e garantire la qualità
- **Orchestrator** (predefinito) — coordinare grafi di attività con dipendenze e agenti paralleli
- **Translate** — tradurre e gestire i file di localizzazione
- **Custom** (facoltativo) — creare flussi di lavoro specializzati per un team

Ogni ruolo può usare un proprio profilo di fornitore e un proprio modello, impostati in Impostazioni → Modalità indipendentemente dal profilo predefinito selezionato in Impostazioni → Fornitori. Un ruolo senza un modello proprio usa il modello del suo profilo, e un ruolo senza profilo usa il profilo predefinito: così è facile bilanciare capacità, velocità e costi in un flusso di lavoro.

## Documentazione

Consulta la documentazione del progetto, inclusa la specifica dell'orchestrazione, in [`apps/docs`](../../apps/docs).

## Installazione

Installa l'estensione **AI Code Orchestrator** dal VS Code Marketplace oppure genera localmente un nuovo VSIX:

```bash
pnpm install
pnpm rebuild:vsix
```

Per ricostruirla e poi installarla in modo interattivo, esegui `pnpm install:vsix`. Il comando ricostruisce esplicitamente la webview prima di creare il bundle e il pacchetto dell'estensione. Un normale `pnpm install` installa solo le dipendenze.

Durante lo sviluppo, la CLI è disponibile dal monorepo:

```bash
pnpm --filter @ai-code-orchestrator/cli dev
```

L'ambito del pacchetto e gli identificatori dei comandi precedenti sono mantenuti per compatibilità con le integrazioni esistenti.

## Attribuzione

AI Code Orchestrator è basato su [Roo Code](https://github.com/RooCodeInc/Roo-Code). L'implementazione mantiene alcune API e identificatori compatibili, così le integrazioni esistenti continuano a funzionare.

## Licenza

[Apache 2.0](../../LICENSE)
