<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=mihas2.ai-code-orchestrator"><img src="https://img.shields.io/badge/VS_Code_Marketplace-007ACC?style=flat&logo=visualstudiocode&logoColor=white" alt="VS Code Marketplace"></a>
</p>

# AI Code Orchestrator

> Twój zespół programistów oparty na AI, bezpośrednio w edytorze.

AI Code Orchestrator to rozszerzenie VS Code i CLI do planowania, implementowania, przeglądania i wyjaśniania oprogramowania za pomocą konfigurowalnych agentów AI. Łączy czat, akcje na kodzie, pracę w terminalu, własne role, integracje MCP i orkiestrację wielu agentów w jednym obszarze roboczym.

## Możliwości

- Generowanie i modyfikowanie kodu na podstawie wymagań w języku naturalnym
- Planowanie architektury i dzielenie pracy na skoordynowane zadania
- Orkiestracja pracy jako DAG z uwzględnieniem zależności, z równoległymi wykonawcami, etapami przeglądu, budżetami i kontrolowaną integracją
- **Optymalizacja kontekstu** – inteligentne zarządzanie kontekstem zmniejsza zużycie tokenów i koszty przy zachowaniu skuteczności
- Przeglądanie zmian, diagnozowanie błędów i ulepszanie istniejącego kodu
- Praca z plikami, terminalami, obrazami i zewnętrznymi narzędziami MCP
- Konfigurowanie dostawców, w tym Vercel AI Gateway i Unbound, modeli, uprawnień i własnych ról
- Przypisywanie poszczególnym rolom profilu dostawcy i modelu; rola bez własnego modelu używa modelu swojego profilu, a rola bez profilu – profilu domyślnego
- Kontynuowanie zadań z edytora lub z wiersza poleceń

## Role

AI Code Orchestrator dopasowuje się do bieżącej pracy:

- **Code** — wprowadzanie zmian i praca z plikami projektu
- **Architect** — projektowanie systemów, specyfikacji i migracji
- **Ask** — odpowiadanie na pytania i wyjaśnianie kodu
- **Debug** — znajdowanie przyczyn problemów i weryfikacja poprawek
- **Reviewer** — weryfikacja zmian, wykrywanie problemów i dbanie o jakość
- **Orchestrator** (domyślna) — koordynowanie grafów zadań z zależnościami i równoległych agentów
- **Translate** — tłumaczenie i zarządzanie plikami lokalizacji
- **Custom** (opcjonalna) — tworzenie wyspecjalizowanych przepływów pracy dla zespołu

Każda rola może używać własnego profilu dostawcy i modelu, ustawianych w Ustawienia → Tryby niezależnie od profilu domyślnego wybranego w Ustawienia → Dostawcy. Rola bez własnego modelu używa modelu swojego profilu, a rola bez profilu – profilu domyślnego, co ułatwia równoważenie możliwości, szybkości i kosztów w całym przepływie pracy.

## Dokumentacja

Dokumentacja projektu, w tym specyfikacja orkiestracji, znajduje się w [`apps/docs`](../../apps/docs).

## Instalacja

Zainstaluj rozszerzenie **AI Code Orchestrator** z VS Code Marketplace lub zbuduj lokalnie nowy plik VSIX:

```bash
pnpm install
pnpm rebuild:vsix
```

Aby je przebudować, a następnie zainstalować interaktywnie, uruchom `pnpm install:vsix`. Polecenie jawnie przebudowuje webview przed spakowaniem rozszerzenia. Zwykłe `pnpm install` instaluje tylko zależności.

Podczas pracy nad projektem CLI jest dostępne z monorepo:

```bash
pnpm --filter @ai-code-orchestrator/cli dev
```

Zakres pakietu i dotychczasowe identyfikatory poleceń zostały zachowane dla zgodności z istniejącymi integracjami.

## Pochodzenie

AI Code Orchestrator powstał na bazie [Roo Code](https://github.com/RooCodeInc/Roo-Code). Implementacja zachowuje wybrane zgodne API i identyfikatory, aby istniejące integracje nadal działały.

## Licencja

[Apache 2.0](../../LICENSE)
