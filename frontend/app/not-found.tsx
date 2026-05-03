import Link from "next/link";
import { Shell } from "@/components/Shell";

export default function NotFoundPage() {
  return (
    <Shell>
      <section className="rounded-2xl border border-slate-200 bg-white/85 p-6 text-center">
        <h1 className="font-heading text-2xl font-semibold text-slate-900">Không tìm thấy trang</h1>
        <p className="mt-2 text-sm text-slate-600">
          Liên kết bạn truy cập không tồn tại hoặc đã được thay đổi.
        </p>
        <Link
          href="/"
          className="mt-4 inline-flex rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800"
        >
          Quay về trang chủ
        </Link>
      </section>
    </Shell>
  );
}
