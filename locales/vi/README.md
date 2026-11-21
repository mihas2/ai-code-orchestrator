<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=mihas2.ai-code-orchestrator"><img src="https://img.shields.io/badge/VS_Code_Marketplace-007ACC?style=flat&logo=visualstudiocode&logoColor=white" alt="VS Code Marketplace"></a>
</p>

# AI Code Orchestrator

> Đội ngũ phát triển AI của bạn, ngay trong trình soạn thảo.

AI Code Orchestrator là tiện ích mở rộng VS Code và CLI để lập kế hoạch, triển khai, rà soát và giải thích phần mềm bằng các tác tử AI có thể cấu hình. Nó kết hợp trò chuyện, thao tác trên mã, quy trình làm việc trong terminal, vai trò tùy chỉnh, tích hợp MCP và điều phối đa tác tử trong một không gian làm việc.

## Khả năng

- Tạo và chỉnh sửa mã từ yêu cầu bằng ngôn ngữ tự nhiên
- Lập kế hoạch kiến trúc và chia công việc thành các nhiệm vụ phối hợp
- Điều phối công việc dưới dạng DAG có tính đến phụ thuộc, với các bộ thực thi song song, giai đoạn rà soát, ngân sách và tích hợp có kiểm soát
- **Tối ưu ngữ cảnh** - quản lý ngữ cảnh thông minh giúp giảm lượng token và chi phí mà vẫn giữ hiệu quả
- Rà soát thay đổi, chẩn đoán lỗi và cải thiện mã hiện có
- Làm việc với tệp, terminal, hình ảnh và công cụ MCP bên ngoài
- Cấu hình nhà cung cấp, bao gồm Vercel AI Gateway và Unbound, mô hình, quyền và vai trò tùy chỉnh
- Gán hồ sơ nhà cung cấp và mô hình cho từng vai trò; vai trò không có mô hình riêng dùng mô hình của hồ sơ, vai trò không có hồ sơ dùng hồ sơ mặc định
- Tiếp tục nhiệm vụ từ trình soạn thảo hoặc dòng lệnh

## Vai trò

AI Code Orchestrator thích ứng với công việc đang làm:

- **Code** — triển khai thay đổi và làm việc với các tệp của dự án
- **Architect** — thiết kế hệ thống, đặc tả và kế hoạch di chuyển
- **Ask** — trả lời câu hỏi và giải thích mã
- **Debug** — tìm nguyên nhân gốc và xác minh bản sửa
- **Reviewer** — xác minh thay đổi, phát hiện vấn đề và bảo đảm chất lượng
- **Orchestrator** (mặc định) — điều phối đồ thị nhiệm vụ có phụ thuộc và các tác tử song song
- **Translate** — dịch và quản lý tệp bản địa hóa
- **Custom** (tùy chọn) — tạo quy trình làm việc chuyên biệt cho nhóm

Mỗi vai trò có thể dùng hồ sơ nhà cung cấp và mô hình riêng, được thiết lập trong Cài đặt → Chế độ, độc lập với hồ sơ mặc định được chọn trong Cài đặt → Nhà cung cấp. Vai trò không có mô hình riêng dùng mô hình của hồ sơ, vai trò không có hồ sơ dùng hồ sơ mặc định, giúp dễ dàng cân bằng năng lực, tốc độ và chi phí trong một quy trình làm việc.

## Tài liệu

Xem tài liệu dự án, bao gồm đặc tả điều phối, trong [`apps/docs`](../../apps/docs).

## Cài đặt

Cài đặt tiện ích **AI Code Orchestrator** từ VS Code Marketplace, hoặc tạo một tệp VSIX mới tại máy:

```bash
pnpm install
pnpm rebuild:vsix
```

Để dựng lại rồi cài đặt theo cách tương tác, hãy chạy `pnpm install:vsix`. Lệnh này dựng lại webview một cách tường minh trước khi đóng gói tiện ích. Lệnh `pnpm install` thông thường chỉ cài đặt các phụ thuộc.

Trong quá trình phát triển, CLI có sẵn từ monorepo:

```bash
pnpm --filter @ai-code-orchestrator/cli dev
```

Phạm vi gói và các định danh lệnh cũ được giữ lại để tương thích với các tích hợp hiện có.

## Nguồn gốc

AI Code Orchestrator được xây dựng dựa trên [Roo Code](https://github.com/RooCodeInc/Roo-Code). Phần triển khai giữ lại một số API và định danh tương thích để các tích hợp hiện có tiếp tục hoạt động.

## Giấy phép

[Apache 2.0](../../LICENSE)
