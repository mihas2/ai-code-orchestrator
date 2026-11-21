<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=mihas2.ai-code-orchestrator"><img src="https://img.shields.io/badge/VS_Code_Marketplace-007ACC?style=flat&logo=visualstudiocode&logoColor=white" alt="VS Code Marketplace"></a>
</p>

# AI Code Orchestrator

> Yapay zekâ destekli geliştirme ekibiniz, doğrudan editörünüzde.

AI Code Orchestrator, yapılandırılabilir yapay zekâ ajanlarıyla yazılım planlamak, geliştirmek, incelemek ve açıklamak için bir VS Code uzantısı ve CLI'dır. Sohbeti, kod eylemlerini, terminal iş akışlarını, özel rolleri, MCP entegrasyonlarını ve çoklu ajan orkestrasyonunu tek bir çalışma alanında birleştirir.

## Yetenekler

- Doğal dildeki gereksinimlerden kod üretme ve değiştirme
- Mimariyi planlama ve işi koordineli görevlere bölme
- İşi bağımlılıkları dikkate alan bir DAG olarak; paralel yürütücüler, inceleme aşamaları, bütçeler ve kontrollü entegrasyonla yönetme
- **Bağlam optimizasyonu** - akıllı bağlam yönetimi, etkinliği korurken token kullanımını ve maliyetleri azaltır
- Değişiklikleri inceleme, hataları teşhis etme ve mevcut kodu iyileştirme
- Dosyalar, terminaller, görseller ve harici MCP araçlarıyla çalışma
- Vercel AI Gateway ve Unbound dahil sağlayıcıları, modelleri, izinleri ve özel rolleri yapılandırma
- Rollere ayrı ayrı sağlayıcı profili ve model atama; kendi modeli olmayan bir rol profilinin modelini, profili olmayan bir rol ise varsayılan profili kullanır
- Görevlere editörden veya komut satırından devam etme

## Roller

AI Code Orchestrator elinizdeki işe uyum sağlar:

- **Code** — değişiklikleri uygulamak ve proje dosyaları üzerinde çalışmak
- **Architect** — sistemler, belirtimler ve geçişler tasarlamak
- **Ask** — soruları yanıtlamak ve kodu açıklamak
- **Debug** — kök nedenleri bulmak ve düzeltmeleri doğrulamak
- **Reviewer** — değişiklikleri doğrulamak, sorunları bulmak ve kaliteyi sağlamak
- **Orchestrator** (varsayılan) — bağımlılıkları dikkate alan görev grafiklerini ve paralel ajanları koordine etmek
- **Translate** — çeviri yapmak ve yerelleştirme dosyalarını yönetmek
- **Custom** (isteğe bağlı) — bir ekip için özel iş akışları oluşturmak

Her rol kendi sağlayıcı profilini ve modelini kullanabilir. Bunlar Ayarlar → Modlar bölümünde, Ayarlar → Sağlayıcılar bölümünde seçilen varsayılan profilden bağımsız olarak belirlenir. Kendi modeli olmayan bir rol profilinin modelini, profili olmayan bir rol ise varsayılan profili kullanır; böylece bir iş akışında yetenek, hız ve maliyet arasında kolayca denge kurulur.

## Belgeler

Orkestrasyon belirtimi dahil proje belgelerine [`apps/docs`](../../apps/docs) dizininden ulaşabilirsiniz.

## Kurulum

**AI Code Orchestrator** uzantısını VS Code Marketplace'ten kurun veya yerel olarak yeni bir VSIX oluşturun:

```bash
pnpm install
pnpm rebuild:vsix
```

Yeniden derleyip ardından etkileşimli olarak kurmak için `pnpm install:vsix` komutunu çalıştırın. Bu komut, uzantıyı paketlemeden önce webview'u açıkça yeniden derler. Normal bir `pnpm install` yalnızca bağımlılıkları kurar.

Geliştirme sırasında CLI monorepo üzerinden kullanılabilir:

```bash
pnpm --filter @ai-code-orchestrator/cli dev
```

Paket kapsamı ve eski komut tanımlayıcıları, mevcut entegrasyonlarla uyumluluk için korunmuştur.

## Kaynak

AI Code Orchestrator, [Roo Code](https://github.com/RooCodeInc/Roo-Code) temel alınarak geliştirilmiştir. Mevcut entegrasyonların çalışmaya devam etmesi için uyumlu bazı API'ler ve tanımlayıcılar korunmuştur.

## Lisans

[Apache 2.0](../../LICENSE)
