"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "@/lib/utils";

const links = [
  { href: "/", label: "Trang chủ" },
  { href: "/chatbot", label: "Chatbot" },
  { href: "/truy-van", label: "Truy vấn" }
];

export function Shell({ children, fullWidth }: { children: React.ReactNode; fullWidth?: boolean }) {
  const pathname = usePathname();
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-50 border-b border-slate-300/70 bg-white/80 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <Link href="/" className="font-heading text-lg font-semibold text-slate-900">
            Admission RAG
          </Link>
          <nav className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 p-1">
            {links.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={clsx(
                    "rounded-full px-3 py-1.5 text-sm font-medium transition",
                    active
                      ? "bg-teal-700 text-white"
                      : "text-slate-700 hover:bg-white hover:text-slate-900"
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>
      <main className={clsx("mx-auto w-full", fullWidth ? "" : "max-w-6xl px-4 py-6 sm:px-6 sm:py-8")}>{children}</main>
    </div>
  );
}
