<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=AIOrchestrator.ai-orchestrator"><img src="https://img.shields.io/badge/VS_Code_Marketplace-007ACC?style=flat&logo=visualstudiocode&logoColor=white" alt="VS Code Marketplace"></a>
  <a href="https://x.com/AI Code Orchestrator"><img src="https://img.shields.io/badge/AI Code Orchestrator-000000?style=flat&logo=x&logoColor=white" alt="X"></a>
</p>
# AI Code Orchestrator

> AI destekli dev ekibin, doğrudan editörünün içinde

<details>
  <summary>🌐 Mevcut diller</summary>

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

## AI Code Orchestrator SİZİN İçin Ne Yapabilir?

- Doğal dil açıklamalarından kod üretin
- Modlarla Uyum Sağlayın: Kod, Mimar, Sor, Hata Ayıkla ve Özel Modlar
- Mevcut kodu yeniden düzenleyin ve hatalarını ayıklayın
- Dokümantasyon yazın ve güncelleyin
- Kod tabanınızla ilgili soruları yanıtlayın
- Tekrarlayan görevleri otomatikleştirin
- MCP Sunucularını kullanın

## Modlar

AI Code Orchestrator, sizin çalışma şeklinize uyum sağlar, tam tersi değil:

- Kod Modu: günlük kodlama, düzenlemeler ve dosya işlemleri
- Mimar Modu: sistemleri, özellikleri ve geçişleri planlayın
- Sor Modu: hızlı cevaplar, açıklamalar ve belgeler
- Hata Ayıklama Modu: sorunları izleyin, günlükler ekleyin, kök nedenleri izole edin
- Çeviri Modu: yerelleştirme dosyalarını çevirin ve yönetin
- Özel Modlar: ekibiniz veya iş akışınız için özel modlar oluşturun

Daha fazla: [Modları kullanma](https://aiorchestrator.github.io/ai-code-orchestrator/basic-usage/using-modes) • [Özel modlar](https://aiorchestrator.github.io/ai-code-orchestrator/advanced-usage/custom-modes)

## Kaynaklar

- **[Dokümantasyon](https://aiorchestrator.github.io/ai-code-orchestrator/):** AI Code Orchestrator'u yükleme, yapılandırma ve ustalaşma konusundaki resmi kılavuz.
- **[GitHub Sorunları](https://github.com/AIOrchestrator/ai-code-orchestrator/issues):** Hataları bildirin ve gelişimi takip edin.

---

## Sorumluluk Reddi Beyanı

**Lütfen dikkat** AI Code Orchestrator, Inc., AI Code Orchestrator ile bağlantılı olarak sağlanan veya kullanıma sunulan herhangi bir kod, model veya diğer araçlar, ilgili üçüncü taraf araçları veya ortaya çıkan çıktılarla ilgili olarak **hiçbir** beyanda bulunmaz veya garanti vermez. Bu tür araçların veya çıktıların kullanımıyla ilişkili **tüm riskleri** üstlenirsiniz; bu tür araçlar **"OLDUĞU GİBİ"** ve **"MEVCUT OLDUĞU GİBİ"** esasına göre sağlanır. Bu tür riskler, fikri mülkiyet ihlali, siber güvenlik açıkları veya saldırıları, önyargı, yanlışlıklar, hatalar, kusurlar, virüsler, kesintiler, mal kaybı veya hasarı ve/veya kişisel yaralanmaları içerebilir, ancak bunlarla sınırlı değildir. Bu tür araçların veya çıktıların kullanımından (yasallığı, uygunluğu ve sonuçları dahil ancak bunlarla sınırlı olmamak üzere) yalnızca siz sorumlusunuz.

---

## Yükleme

**AI Code Orchestrator** uzantısını VS Code Marketplace'den yükleyin veya yerel olarak VSIX yeniden oluşturun:

```bash
pnpm install
pnpm rebuild:vsix
```

İnteraktif olarak yeniden oluşturup ardından yüklemek için `pnpm install:vsix` çalıştırın. Bu, uzantının paketlenmesi ve paketlenmesi öncesinde webview'i açıkça yeniden oluşturur. Normal bir `pnpm install` yalnızca bağımlılıkları yükler.

Geliştirme sırasında CLI monorepo'dan kullanılabilir:

```bash
pnpm --filter @ai-code-orchestrator/cli dev
```

Paket kapsamı ve eski komut kimlikleri, mevcut entegrasyonlarla uyumluluğu korumak için korundu.

## Lisans

[Apache 2.0 © 2025 AI Code Orchestrator, Inc.](../../LICENSE)
