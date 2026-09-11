# BuildAppraisal AI - Phần mềm AI Hỗ trợ Thẩm định Dự án Xây dựng

> **Dự án thí điểm tại:** Sở Xây dựng tỉnh Điện Biên  
> **Mục tiêu:** Tự động hóa và hỗ trợ chuyên viên thẩm định hồ sơ dự án, thiết kế cơ sở, dự toán xây dựng công trình sử dụng công nghệ AI / RAG và kiểm tra quy chuẩn tự động.

---

## 🏗️ Kiến trúc Hệ thống

Hệ thống được tổ chức dưới dạng **Turborepo Monorepo**, bao gồm:

- **Web Frontend (`apps/web`):** Giao diện chuyên viên thẩm định và quản lý hồ sơ xây dựng trên nền tảng Next.js 15 (App Router, Tailwind CSS, Shadcn UI).
- **Backend API (`services/api`):** API dịch vụ nghiệp vụ thẩm định, quản lý hồ sơ, workflow duyệt, tích hợp dữ liệu viết bằng NestJS và Prisma ORM.
- **AI Worker (`services/ai-worker`):** Dịch vụ xử lý tài liệu, OCR bản vẽ/thuyết minh, vector hóa tri thức quy chuẩn Việt Nam (QCVN, TCVN) và RAG engine viết bằng Python FastAPI.
- **Shared Packages (`packages/*`):** Chứa thư viện dùng chung:
  - `@ba/core`: Định nghĩa Prisma schema, DB client, entities, types.
  - `@ba/shared`: Tiện ích dùng chung, constants, validation schemas.
  - `@ba/eslint-config`: Cấu hình linting chuẩn.
  - `@ba/typescript-config`: Cấu hình TypeScript chuẩn.

---

## 🛠️ Công nghệ Sử dụng (Tech Stack)

| Thành phần | Công nghệ |
| :--- | :--- |
| **Monorepo Manager** | [Turborepo](https://turbo.build/) & [pnpm](https://pnpm.io/) |
| **Backend Framework** | [NestJS](https://nestjs.com/) (TypeScript) |
| **Frontend Framework** | [Next.js 15](https://nextjs.org/) (React 19, Tailwind CSS) |
| **AI / Machine Learning** | Python [FastAPI](https://fastapi.tiangolo.com/), LangChain / LlamaIndex, OCR |
| **Cơ sở dữ liệu chính & Vector** | [PostgreSQL 17](https://www.postgresql.org/) với extension [pgvector](https://github.com/pgvector/pgvector) |
| **Caching & Job Queue** | [Redis 7](https://redis.io/) (BullMQ) |
| **Lưu trữ hồ sơ (Object Storage)** | [MinIO](https://min.io/) (Tương thích S3 API) |
| **ORM / Database Access** | [Prisma](https://www.prisma.io/) |
| **Tích hợp ngoài** | DVC Dịch vụ công Tấn Dân (Mock/Thực tế) |

---

## 🚀 Hướng dẫn Cài đặt & Khởi chạy

### 1. Yêu cầu Tiên quyết
- **Node.js**: >= 20.x
- **pnpm**: 10.x (`npm i -g pnpm@10.26.0`)
- **Docker** & **Docker Compose**
- **Python**: >= 3.11 (cho AI Worker)

### 2. Cài đặt Phụ thuộc
```bash
# Cài đặt dependencies cho toàn bộ workspace
pnpm install
```

### 3. Khởi chạy Dịch vụ Hạ tầng (Docker)
Khởi động cơ sở dữ liệu PostgreSQL (pgvector), Redis và MinIO:
```bash
# Khởi động containers
docker compose up -d

# Hoặc dùng lệnh script
pnpm docker:up
```

### 4. Cấu hình Môi trường
Tạo file `.env` từ file mẫu `.env.example`:
```bash
cp .env.example .env
```
Cập nhật các biến môi trường cấu hình kết nối DB, MinIO, API keys nếu cần.

### 5. Khởi tạo Cơ sở dữ liệu
```bash
# Sinh Prisma Client
pnpm db:generate

# Đẩy schema vào cơ sở dữ liệu PostgreSQL
pnpm db:push

# Khởi tạo dữ liệu mẫu ban đầu
pnpm db:seed
```

### 6. Khởi chạy Chế độ Phát triển (Development)
Chạy toàn bộ các ứng dụng và dịch vụ qua Turborepo:
```bash
pnpm dev
```

---

## 📜 Các Lệnh Thao tác Thường dùng

| Lệnh | Mô tả |
| :--- | :--- |
| `pnpm dev` | Chạy song song môi trường dev cho tất cả apps & services |
| `pnpm build` | Build tất cả packages và apps |
| `pnpm lint` | Chạy kiểm tra cú pháp và định dạng code |
| `pnpm test` | Chạy kiểm thử tự động |
| `pnpm db:generate` | Sinh Prisma client |
| `pnpm db:push` | Đồng bộ cấu trúc schema lên CSDL PostgreSQL |
| `pnpm db:seed` | Nạp dữ liệu mẫu ban đầu |
| `pnpm docker:up` | Khởi động Postgres, Redis, MinIO |
| `pnpm docker:down` | Dừng các container hạ tầng |

---

## 🏢 Đơn vị Chủ trì & Phát triển
- **Đơn vị ứng dụng:** Sở Xây dựng tỉnh Điện Biên
- **Dự án:** Hệ thống Trợ lý Thẩm định Hồ sơ Xây dựng Thông minh (BuildAppraisal AI)
