# BuildAppraisal AI — Phần mềm hỗ trợ thẩm định dự án xây dựng

> **Thí điểm:** Sở Xây dựng tỉnh Điện Biên · **Giai đoạn:** phát triển (100% dữ liệu demo)
> **Căn cứ nghiệp vụ:** Luật Xây dựng 135/2025/QH15, NĐ 217/2026/NĐ-CP, NĐ 206/2026/NĐ-CP, NĐ 207/2026/NĐ-CP, NĐ 30/2020/NĐ-CP (thể thức văn bản)

Kế hoạch nâng cấp và lộ trình: xem [`implementation_plan.md`](implementation_plan.md).

## Kiến trúc hiện tại

```
Web SPA (Vite + React 19 + TypeScript strict, cổng 3008)
 ├─ src/pages, src/components        Giao diện (UI kit chuẩn ERP: DataGrid, GridToolbar, Slide Panel, Modal…)
 ├─ src/hooks/useData.ts             Hook TanStack Query (cache, loading, lỗi)
 ├─ src/data-access/*                Lớp truy cập dữ liệu DUY NHẤT (Supabase ↔ kiểu miền; chế độ demo offline)
 ├─ src/lib/sla.ts, workflow.ts,     Nghiệp vụ: ngày làm việc/SLA, quy trình NĐ 217, thẩm quyền,
 │   jurisdiction.ts, documents/*     văn bản hành chính A4 (xem trước, in, DOCX)
 └─ src/types/*                      Kiểu dữ liệu miền

Supabase (PostgreSQL)
 ├─ supabase/migrations/*.sql        Schema, RPC (dashboard, transition_dossier, refresh_sla_status),
 │                                    trigger audit_logs, tìm kiếm không dấu (unaccent), lịch nghỉ lễ
 └─ supabase/seed.sql                Sinh tự động từ src/data (không sửa tay)
```

Backend NestJS và AI worker (RAG pháp luật) **chưa triển khai** — nằm trong GĐ 5–6 của kế hoạch.
Trợ lý AI hiện tại là **bản minh họa** (được gắn nhãn trên giao diện).

## Cài đặt & chạy

Yêu cầu: Node.js ≥ 20, pnpm ≥ 10.

```bash
pnpm install
cp .env.example .env      # điền thông tin Supabase; bỏ trống → chạy chế độ demo offline
pnpm dev                  # http://localhost:3008
```

### Cơ sở dữ liệu (Supabase)

```bash
pnpm db:status            # xem migration đã/chưa áp dụng
pnpm db:migrate           # áp dụng migration mới (theo dõi trong bảng schema_migrations)
pnpm db:seed:generate     # sinh supabase/seed.sql từ bộ dữ liệu demo
pnpm db:seed              # XÓA và nạp lại toàn bộ dữ liệu demo
pnpm db:check             # kiểm tra truy cập bằng anon key (giống Web)
```

> ⚠️ Migration `20260926000002_dev_open_access.sql` mở quyền cho anon — **chỉ dùng khi phát triển**.
> Trước khi nhập hồ sơ thật phải thay bằng đăng nhập + RLS theo vai trò/phòng ban và chuyển hạ tầng về trong nước.

## Kiểm tra chất lượng

| Lệnh | Nội dung |
|---|---|
| `pnpm typecheck` | TypeScript strict cho `src/` và `scripts/` |
| `pnpm lint` | ESLint (react-hooks, cấm `alert`/`confirm`/`toLocaleDateString`) |
| `pnpm lint:ui` | Quét quy chuẩn UI của dự án (Tooltip, SearchableSelect, DateInput, dark mode, không đọc mock…) |
| `pnpm test` | Vitest: SLA ngày làm việc, thẩm quyền, tìm kiếm tiếng Việt, xuất DOCX |
| `pnpm check` | Chạy toàn bộ các bước trên |
| `pnpm build` | Build production (tách chunk theo trang & thư viện) |

CI (GitHub Actions) chạy tất cả các bước trên cho mỗi push / pull request.

## Chạy thử quy trình theo vai trò

Chưa có đăng nhập ở giai đoạn phát triển. Bấm avatar góc phải → **"Thao tác với vai trò"** để chuyển giữa
Chuyên viên / Trưởng phòng / Lãnh đạo Sở; mọi thao tác được ghi vào `audit_logs` và `workflow_transitions`
với đúng tên cán bộ.

## Quy tắc cho AI Assistant

`RULES.md` là nguồn duy nhất; sau khi sửa chạy `pnpm rules:sync` để cập nhật `CLAUDE.md`, `AGENTS.md`, `GEMINI.md`.
