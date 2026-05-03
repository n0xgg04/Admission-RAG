import Link from "next/link";
import { Shell } from "@/components/Shell";

const features = [
  "Hỏi đáp nhanh về trường, ngành và phương thức xét tuyển",
  "Tra cứu thông tin trường và điểm chuẩn theo bảng dễ đọc",
  "Ưu tiên dữ liệu đã chuẩn hóa trong bộ dữ liệu hiện có"
];

export default function HomePage() {
  return (
    <Shell>
      <section className="mesh-bg relative overflow-hidden rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-panel sm:p-10">
        <div className="animate-fade-up space-y-5">
          <p className="inline-flex rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-teal-700">
            localhost demo
          </p>
          <h1 className="max-w-3xl font-heading text-3xl font-semibold leading-tight text-slate-900 sm:text-5xl">
            Trợ lý tra cứu tuyển sinh đại học 2025
          </h1>
          <p className="max-w-2xl text-sm text-slate-700 sm:text-base">
            Nền tảng giúp học sinh và phụ huynh tìm thông tin tuyển sinh theo cách trực quan,
            dễ hiểu, bám sát dữ liệu đã được làm sạch.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/chatbot"
              className="rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800"
            >
              Bắt đầu hỏi đáp
            </Link>
            <Link
              href="/truy-van"
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition hover:border-slate-400"
            >
              Xem bảng tra cứu
            </Link>
          </div>
        </div>
      </section>

      <section className="mt-6 grid gap-4 sm:grid-cols-3">
        {features.map((feature, idx) => (
          <article
            key={feature}
            className="animate-fade-up rounded-2xl border border-slate-200 bg-white/80 p-4"
            style={{ animationDelay: `${idx * 100}ms` }}
          >
            <p className="text-sm font-medium text-slate-800">{feature}</p>
          </article>
        ))}
      </section>
    </Shell>
  );
}
