"use client";

import { useEffect } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-4 text-center">
      <div className="rounded-full bg-red-100 p-4 text-red-600 mb-4">
        <AlertCircle className="h-10 w-10" />
      </div>
      <h2 className="text-xl font-bold text-slate-800">Đã xảy ra lỗi khi xử lý!</h2>
      <p className="mt-2 text-sm text-slate-500 max-w-md">
        {error.message || "Hệ thống gặp sự cố ngoài ý muốn. Vui lòng thử lại."}
      </p>
      <button
        onClick={() => reset()}
        className="mt-6 inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors cursor-pointer"
      >
        <RefreshCw className="mr-2 h-4 w-4" />
        Thử lại
      </button>
    </div>
  );
}
