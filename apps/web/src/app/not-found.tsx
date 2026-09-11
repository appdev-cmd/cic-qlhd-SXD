import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-4 text-center">
      <h1 className="text-6xl font-bold text-slate-800">404</h1>
      <h2 className="mt-4 text-xl font-semibold text-slate-700">Trang không tìm thấy</h2>
      <p className="mt-2 text-sm text-slate-500">
        Đường dẫn bạn yêu cầu không tồn tại hoặc tính năng đang được phát triển.
      </p>
      <Link
        href="/dashboard"
        className="mt-6 inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        Quay lại Trang chủ
      </Link>
    </div>
  );
}
