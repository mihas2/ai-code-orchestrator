<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=AIOrchestrator.ai-orchestrator"><img src="https://img.shields.io/badge/VS_Code_Marketplace-007ACC?style=flat&logo=visualstudiocode&logoColor=white" alt="VS Code Marketplace"></a>
  <a href="https://x.com/AI Code Orchestrator"><img src="https://img.shields.io/badge/AI Code Orchestrator-000000?style=flat&logo=x&logoColor=white" alt="X"></a>
</p>
# AI Code Orchestrator

> Tim dev bertenaga AI-mu, langsung di editor kamu

<details>
  <summary>🌐 Bahasa yang tersedia</summary>

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

## Apa yang Bisa AI Code Orchestrator Lakukan Untuk ANDA?

- Menghasilkan Kode dari deskripsi bahasa alami
- Beradaptasi dengan Mode: Kode, Arsitek, Tanya, Debug, dan Mode Kustom
- Refactor & Debug kode yang ada
- Menulis & Memperbarui dokumentasi
- Menjawab Pertanyaan tentang basis kode Anda
- Mengotomatiskan tugas-tugas yang berulang
- Memanfaatkan Server MCP

## Mode

AI Code Orchestrator beradaptasi dengan cara Anda bekerja, bukan sebaliknya:

- Mode Kode: pengkodean sehari-hari, pengeditan, dan operasi file
- Mode Arsitek: merencanakan sistem, spesifikasi, dan migrasi
- Mode Tanya: jawaban cepat, penjelasan, dan dokumen
- Mode Debug: melacak masalah, menambahkan log, mengisolasi akar penyebab
- Mode Terjemahan: menerjemahkan dan mengelola file lokalisasi
- Mode Kustom: buat mode khusus untuk tim atau alur kerja Anda

Pelajari lebih lanjut: [Menggunakan Mode](https://aiorchestrator.github.io/ai-code-orchestrator/basic-usage/using-modes) • [Mode Kustom](https://aiorchestrator.github.io/ai-code-orchestrator/advanced-usage/custom-modes)

## Sumber daya

- **[Dokumentasi](https://aiorchestrator.github.io/ai-code-orchestrator/):** Panduan resmi untuk menginstal, mengonfigurasi, dan menguasai AI Code Orchestrator.
- **[Masalah GitHub](https://github.com/AIOrchestrator/ai-code-orchestrator/issues):** Laporkan bug dan lacak pengembangan.

---

## Penafian

**Harap dicatat** bahwa AI Code Orchestrator, Inc. **tidak** membuat pernyataan atau jaminan apapun mengenai kode, model, atau alat lain yang disediakan atau tersedia sehubungan dengan AI Code Orchestrator, alat pihak ketiga terkait, atau output yang dihasilkan. Anda menanggung **semua risiko** yang terkait dengan penggunaan alat atau output tersebut; alat tersebut disediakan atas dasar **"SEBAGAIMANA ADANYA"** dan **"SEBAGAIMANA TERSEDIA"**. Risiko tersebut dapat mencakup, namun tidak terbatas pada, pelanggaran kekayaan intelektual, kerentanan atau serangan siber, bias, ketidakakuratan, kesalahan, cacat, virus, waktu henti, kehilangan atau kerusakan properti, dan/atau cedera pribadi. Anda sepenuhnya bertanggung jawab atas penggunaan Anda atas alat atau output tersebut (termasuk, namun tidak terbatas pada, legalitas, kesesuaian, dan hasilnya).

---

## Instalasi

Instal ekstensi **AI Code Orchestrator** dari VS Code Marketplace, atau bangun ulang VSIX secara lokal:

```bash
pnpm install
pnpm rebuild:vsix
```

Untuk membangun ulang lalu menginstalnya secara interaktif, jalankan `pnpm install:vsix`. Ini secara eksplisit membangun ulang webview sebelum pengelompokan dan pengemasan ekstensi. `pnpm install` normal hanya menginstal dependensi.

Selama pengembangan, CLI tersedia dari monorepo:

```bash
pnpm --filter @ai-code-orchestrator/cli dev
```

Scope paket dan identifier perintah legasi dipertahankan untuk menjaga kompatibilitas dengan integrasi yang ada.

## Lisensi

[Apache 2.0 © 2025 AI Code Orchestrator, Inc.](../../LICENSE)
