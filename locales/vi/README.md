<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=AIOrchestrator.ai-orchestrator"><img src="https://img.shields.io/badge/VS_Code_Marketplace-007ACC?style=flat&logo=visualstudiocode&logoColor=white" alt="VS Code Marketplace"></a>
  <a href="https://x.com/AI Code Orchestrator"><img src="https://img.shields.io/badge/AI Code Orchestrator-000000?style=flat&logo=x&logoColor=white" alt="X"></a>
</p>
# AI Code Orchestrator

> Đội ngũ dev dùng AI của bạn, ngay trong trình chỉnh sửa

<details>
  <summary>🌐 Các ngôn ngữ có sẵn</summary>

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

## AI Code Orchestrator có thể làm gì cho BẠN?

- Tạo mã từ mô tả ngôn ngữ tự nhiên
- Thích ứng với các Chế độ: Mã, Kiến trúc sư, Hỏi, Gỡ lỗi và Chế độ tùy chỉnh
- Tái cấu trúc & gỡ lỗi mã hiện có
- Viết & cập nhật tài liệu
- Trả lời câu hỏi về cơ sở mã của bạn
- Tự động hóa các tác vụ lặp đi lặp lại
- Sử dụng Máy chủ MCP

## Chế độ

AI Code Orchestrator thích ứng với cách bạn làm việc, chứ không phải ngược lại:

- Chế độ Mã: viết mã hàng ngày, chỉnh sửa và các thao tác với tệp
- Chế độ Kiến trúc sư: lập kế hoạch hệ thống, thông số kỹ thuật và di chuyển
- Chế độ Hỏi: câu trả lời nhanh, giải thích và tài liệu
- Chế độ Gỡ lỗi: theo dõi sự cố, thêm nhật ký, cô lập nguyên nhân gốc rễ
- Chế độ Dịch: dịch và quản lý các tệp bản địa hóa
- Chế độ Tùy chỉnh: xây dựng các chế độ chuyên biệt cho nhóm hoặc quy trình làm việc của bạn

Xem thêm: [Sử dụng Chế độ](https://aiorchestrator.github.io/ai-code-orchestrator/basic-usage/using-modes) • [Chế độ tùy chỉnh](https://aiorchestrator.github.io/ai-code-orchestrator/advanced-usage/custom-modes)

## Tài nguyên

- **[Tài liệu](https://aiorchestrator.github.io/ai-code-orchestrator/):** Hướng dẫn chính thức để cài đặt, cấu hình và sử dụng thành thạo AI Code Orchestrator.
- **[Vấn đề trên GitHub](https://github.com/AIOrchestrator/ai-code-orchestrator/issues):** Báo cáo lỗi và theo dõi quá trình phát triển.

---

## Tuyên bố miễn trừ trách nhiệm

**Xin lưu ý** rằng AI Code Orchestrator, Inc. **không** đưa ra bất kỳ tuyên bố hay bảo đảm nào liên quan đến bất kỳ mã, mô hình hoặc công cụ nào khác được cung cấp hoặc cung cấp liên quan đến AI Code Orchestrator, bất kỳ công cụ nào của bên thứ ba được liên kết hoặc bất kỳ kết quả đầu ra nào. Bạn chịu **mọi rủi ro** liên quan đến việc sử dụng bất kỳ công cụ hoặc kết quả đầu ra nào như vậy; các công cụ đó được cung cấp trên cơ sở **"NGUYÊN TRẠNG"** và **"NHƯ HIỆN CÓ"**. Những rủi ro đó có thể bao gồm, nhưng không giới hạn ở, vi phạm sở hữu trí tuệ, các lỗ hổng hoặc tấn công mạng, thiên vị, không chính xác, lỗi, khiếm khuyết, vi-rút, thời gian ngừng hoạt động, mất mát hoặc hư hỏng tài sản và/hoặc thương tích cá nhân. Bạn hoàn toàn chịu trách nhiệm về việc sử dụng bất kỳ công cụ hoặc kết quả đầu ra nào đó (bao gồm, nhưng không giới hạn ở, tính hợp pháp, tính phù hợp và kết quả của chúng).

---

## Cài đặt

Cài đặt mở rộng **AI Code Orchestrator** từ VS Code Marketplace, hoặc xây dựng lại VSIX cục bộ:

```bash
pnpm install
pnpm rebuild:vsix
```

Để xây dựng lại sau đó cài đặt tương tác, chạy `pnpm install:vsix`. Điều này xây dựng rõ ràng webview trước khi đóng gói và đóng gói mở rộng. `pnpm install` thông thường chỉ cài đặt các phụ thuộc.

Trong quá trình phát triển, CLI có sẵn từ monorepo:

```bash
pnpm --filter @ai-code-orchestrator/cli dev
```

Phạm vi gói và các định danh lệnh cũ được giữ lại để duy trì tính tương thích với các tích hợp hiện có.

## Giấy phép

[Apache 2.0 © 2025 AI Code Orchestrator, Inc.](../../LICENSE)
