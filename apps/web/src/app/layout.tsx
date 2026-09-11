import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BuildAppraisal AI - Sở Xây dựng Điện Biên",
  description: "Hệ thống AI Hỗ trợ Thẩm định Dự án Xây dựng - Sở Xây dựng tỉnh Điện Biên",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi">
      <body className="antialiased min-h-screen bg-slate-50 text-slate-900">
        {children}
      </body>
    </html>
  );
}
