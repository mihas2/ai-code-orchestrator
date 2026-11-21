<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=mihas2.ai-code-orchestrator"><img src="https://img.shields.io/badge/VS_Code_Marketplace-007ACC?style=flat&logo=visualstudiocode&logoColor=white" alt="VS Code Marketplace"></a>
</p>

# AI Code Orchestrator

> Tim pengembangan bertenaga AI Anda, langsung di editor.

AI Code Orchestrator adalah ekstensi VS Code dan CLI untuk merencanakan, mengimplementasikan, meninjau, dan menjelaskan perangkat lunak dengan agen AI yang dapat dikonfigurasi. Ekstensi ini menggabungkan chat, aksi kode, alur kerja terminal, peran kustom, integrasi MCP, dan orkestrasi multi-agen dalam satu ruang kerja.

## Kemampuan

- Membuat dan mengubah kode dari kebutuhan dalam bahasa alami
- Merencanakan arsitektur dan memecah pekerjaan menjadi tugas-tugas yang terkoordinasi
- Mengorkestrasi pekerjaan sebagai DAG yang memperhatikan dependensi, dengan eksekutor paralel, tahap review, anggaran, dan integrasi terkendali
- **Optimasi konteks** - pengelolaan konteks yang cerdas mengurangi penggunaan token dan biaya tanpa mengurangi efektivitas
- Meninjau perubahan, mendiagnosis kegagalan, dan memperbaiki kode yang ada
- Bekerja dengan file, terminal, gambar, dan tool MCP eksternal
- Mengonfigurasi provider, termasuk Vercel AI Gateway dan Unbound, model, izin, dan peran kustom
- Menetapkan profil provider dan model untuk tiap peran; peran tanpa model sendiri memakai model profilnya, dan peran tanpa profil memakai profil default
- Melanjutkan tugas dari editor atau baris perintah

## Peran

AI Code Orchestrator menyesuaikan diri dengan pekerjaan yang sedang dilakukan:

- **Code** — mengimplementasikan perubahan dan bekerja dengan file proyek
- **Architect** — merancang sistem, spesifikasi, dan migrasi
- **Ask** — menjawab pertanyaan dan menjelaskan kode
- **Debug** — mengisolasi akar masalah dan memvalidasi perbaikan
- **Reviewer** — memvalidasi perubahan, menemukan masalah, dan menjaga kualitas
- **Orchestrator** (default) — mengoordinasikan grafik tugas yang memperhatikan dependensi dan agen paralel
- **Translate** — menerjemahkan dan mengelola file lokalisasi
- **Custom** (opsional) — membuat alur kerja khusus untuk tim

Setiap peran dapat memakai profil provider dan model sendiri, yang diatur di Pengaturan → Mode secara terpisah dari profil default yang dipilih di Pengaturan → Provider. Peran tanpa model sendiri memakai model profilnya, dan peran tanpa profil memakai profil default, sehingga mudah menyeimbangkan kemampuan, kecepatan, dan biaya dalam satu alur kerja.

## Dokumentasi

Lihat dokumentasi proyek, termasuk spesifikasi orkestrasi, di [`apps/docs`](../../apps/docs).

## Instalasi

Pasang ekstensi **AI Code Orchestrator** dari VS Code Marketplace, atau buat VSIX baru secara lokal:

```bash
pnpm install
pnpm rebuild:vsix
```

Untuk membangun ulang lalu memasangnya secara interaktif, jalankan `pnpm install:vsix`. Perintah ini secara eksplisit membangun ulang webview sebelum membundel dan mengemas ekstensi. `pnpm install` biasa hanya memasang dependensi.

Selama pengembangan, CLI tersedia dari monorepo:

```bash
pnpm --filter @ai-code-orchestrator/cli dev
```

Cakupan paket dan pengenal perintah lama dipertahankan agar tetap kompatibel dengan integrasi yang sudah ada.

## Atribusi

AI Code Orchestrator didasarkan pada [Roo Code](https://github.com/RooCodeInc/Roo-Code). Implementasinya mempertahankan beberapa API dan pengenal yang kompatibel agar integrasi yang sudah ada tetap berfungsi.

## Lisensi

[Apache 2.0](../../LICENSE)
