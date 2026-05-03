"use client";

import { FormEvent, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Shell } from "@/components/Shell";
import { StatusBadge } from "@/components/StatusBadge";
import { api, ChatResponse } from "@/lib/api";

type Msg = {
  role: "user" | "bot";
  text: string;
  meta?: Pick<ChatResponse, "used_chunks" | "data_sufficient" | "note">;
};

export default function ChatbotPage() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [universityCode, setUniversityCode] = useState<string>("");
  const [query, setQuery] = useState<string>("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  const canSend = useMemo(() => query.trim().length > 0 && !loading, [query, loading]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const q = query.trim();
    if (!q || loading) {
      return;
    }

    setError("");
    setLoading(true);
    setMessages((prev) => [...prev, { role: "user", text: q }]);
    setQuery("");

    try {
      const res = await api.chat({
        query: q,
        session_id: sessionId,
        university_code: universityCode.trim() || null
      });
      if (res.session_id) {
        setSessionId(res.session_id);
      }
      setMessages((prev) => [
        ...prev,
        {
          role: "bot",
          text: res.answer,
          meta: {
            used_chunks: res.used_chunks,
            data_sufficient: res.data_sufficient,
            note: res.note
          }
        }
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không gọi được API /chat");
    } finally {
      setLoading(false);
    }
  }

  function startNewSession() {
    if (loading) {
      return;
    }
    setSessionId(null);
    setMessages([]);
    setQuery("");
    setError("");
  }

  return (
    <Shell>
      <section className="space-y-4">
        <div className="rounded-2xl border border-slate-200 bg-white/85 p-4 sm:p-5">
          <h1 className="font-heading text-2xl font-semibold text-slate-900">Tư vấn tuyển sinh bằng hội thoại</h1>
          <p className="mt-1 text-sm text-slate-600">
            Bạn có thể hỏi tự nhiên như khi nhắn tin: điểm chuẩn, học phí, ngành đào tạo,
            phương thức xét tuyển, điều kiện hồ sơ...
          </p>
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Gợi ý câu hỏi</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {[
                "Điểm chuẩn ngành Công nghệ thông tin của BKA là bao nhiêu?",
                "Học phí trường Ngoại thương năm 2025 như thế nào?",
                "Trường nào ở Hà Nội có ngành Kinh tế quốc tế?"
              ].map((sample) => (
                <button
                  key={sample}
                  type="button"
                  onClick={() => setQuery(sample)}
                  className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs text-slate-700 hover:border-slate-400"
                >
                  {sample}
                </button>
              ))}
            </div>
          </div>
          <details className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
            <summary className="cursor-pointer text-sm font-medium text-slate-700">Tùy chọn nâng cao (không bắt buộc)</summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="space-y-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Giới hạn theo mã trường</span>
                <input
                  value={universityCode}
                  onChange={(e) => setUniversityCode(e.target.value.toUpperCase())}
                  placeholder="VD: BKA, KHA"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-teal-600 focus:ring"
                />
              </label>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                <p className="font-semibold text-slate-700">Trí nhớ hội thoại</p>
                <p className="mt-1">
                  Hệ thống tự tạo mã phiên và ghi nhớ ngắn hạn 5 câu hỏi gần nhất để hiểu ngữ cảnh tốt hơn.
                </p>
                <p className="mt-1 font-mono text-[11px] text-slate-500">
                  Phiên hiện tại: {sessionId || "(sẽ tạo tự động khi bạn gửi câu hỏi đầu tiên)"}
                </p>
                <button
                  type="button"
                  onClick={startNewSession}
                  disabled={loading}
                  className="mt-2 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:border-slate-400 disabled:opacity-50"
                >
                  Bắt đầu phiên mới
                </button>
              </div>
            </div>
          </details>
          <p className="mt-2 text-xs text-slate-500">
            Nếu dữ liệu thiếu, hệ thống sẽ trả lời rõ ràng thay vì suy đoán.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white/85 p-4 sm:p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-heading text-lg font-semibold text-slate-900">Hỏi đáp</h2>
            {loading ? <StatusBadge ok={true} label="Đang xử lý..." /> : null}
          </div>

          <div className="mb-4 h-[45vh] space-y-3 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-3">
            {messages.length === 0 ? (
              <p className="text-sm text-slate-500">Chưa có hội thoại. Hãy nhập câu hỏi đầu tiên.</p>
            ) : (
              messages.map((msg, idx) => (
                <article
                  key={`${msg.role}-${idx}`}
                  className={msg.role === "user" ? "ml-auto max-w-[90%]" : "mr-auto max-w-[90%]"}
                >
                  <div
                    className={
                      msg.role === "user"
                        ? "rounded-2xl rounded-tr-sm bg-teal-700 px-3 py-2 text-sm text-white"
                        : "rounded-2xl rounded-tl-sm border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                    }
                  >
                    {msg.role === "bot" ? (
                      <div className="space-y-2 leading-relaxed">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={{
                            p: ({ children }) => <p className="whitespace-pre-wrap">{children}</p>,
                            ul: ({ children }) => <ul className="list-disc pl-5">{children}</ul>,
                            ol: ({ children }) => <ol className="list-decimal pl-5">{children}</ol>,
                            li: ({ children }) => <li className="mb-1">{children}</li>,
                            strong: ({ children }) => <strong className="font-semibold text-slate-900">{children}</strong>,
                            a: ({ href, children }) => (
                              <a href={href} target="_blank" rel="noreferrer" className="text-teal-700 underline">
                                {children}
                              </a>
                            ),
                            code: ({ children }) => (
                              <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-xs">{children}</code>
                            )
                          }}
                        >
                          {msg.text}
                        </ReactMarkdown>
                      </div>
                    ) : (
                      <p className="whitespace-pre-wrap leading-relaxed">{msg.text}</p>
                    )}
                  </div>
                  {msg.role === "bot" && msg.meta ? (
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span>Nguồn tham chiếu: {msg.meta.used_chunks} đoạn dữ liệu</span>
                      <StatusBadge
                        ok={msg.meta.data_sufficient}
                        label={msg.meta.data_sufficient ? "Đủ dữ liệu" : "Thiếu dữ liệu"}
                      />
                      {msg.meta.note ? <span>note: {msg.meta.note}</span> : null}
                    </div>
                  ) : null}
                </article>
              ))
            )}

            {loading ? (
              <article className="mr-auto max-w-[90%]">
                <div className="rounded-2xl rounded-tl-sm border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                  <div className="flex items-center gap-2">
                    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-teal-700" />
                    <span>AI đang tìm kiếm thông tin...</span>
                  </div>
                </div>
              </article>
            ) : null}
          </div>

          <form onSubmit={onSubmit} className="space-y-2">
            <textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              rows={3}
              placeholder="Ví dụ: Điểm chuẩn ngành Công nghệ thông tin trường BKA là bao nhiêu?"
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-teal-600 focus:ring"
            />
            <div className="flex items-center justify-between">
              {error ? <p className="text-xs text-rose-700">{error}</p> : <span />}
              <button
                type="submit"
                disabled={!canSend}
                className="rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Gửi câu hỏi
              </button>
            </div>
          </form>
        </div>
      </section>
    </Shell>
  );
}
