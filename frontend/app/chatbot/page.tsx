"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Shell } from "@/components/Shell";
import { api, ChatResponse, Conversation } from "@/lib/api";

type Msg = {
  role: "user" | "bot";
  text: string;
  meta?: Pick<ChatResponse, "used_chunks" | "data_sufficient" | "note">;
};

const samples = [
  "Điểm chuẩn ngành Công nghệ thông tin của BKA là bao nhiêu?",
  "Học phí trường Ngoại thương năm 2025 như thế nào?",
  "Trường nào ở Hà Nội có ngành Kinh tế quốc tế?"
];

export default function ChatbotPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [query, setQuery] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [streamingText, setStreamingText] = useState<string>("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const canSend = useMemo(() => query.trim().length > 0 && !loading, [query, loading]);

  useEffect(() => {
    api.conversations.list().then((res) => {
      setConversations(res.conversations ?? []);
    }).catch(() => {
    });
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingText]);

  async function loadConversation(id: string) {
    try {
      const res = await api.conversations.get(id);
      const conv = res.conversation;
      const loaded: Msg[] =
        conv.messages?.map((m) =>
          m.role === "user"
            ? { role: "user", text: m.content }
            : { role: "bot", text: m.content }
        ) ?? [];
      setActiveId(id);
      setMessages(loaded);
      setError("");
      setStreamingText("");
    } catch {
      setError("Không tải được cuộc trò chuyện");
    }
  }

  async function createConversation() {
    try {
      const res = await api.conversations.create();
      const conv = res.conversation;
      setConversations((prev) => [conv, ...prev]);
      setActiveId(conv.id);
      setMessages([]);
      setQuery("");
      setError("");
      setStreamingText("");
    } catch {
      setError("Không tạo được cuộc trò chuyện mới");
    }
  }

  async function deleteConversation(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    try {
      await api.conversations.delete(id);
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (activeId === id) {
        setActiveId(null);
        setMessages([]);
      }
    } catch {
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const q = query.trim();
    if (!q || loading) return;

    setError("");
    setLoading(true);
    setQuery("");
    setMessages((prev) => [...prev, { role: "user", text: q }]);
    setStreamingText("");

    const sessionId = activeId;

    try {
      let streamed = "";
      await api.chatStream(
        { query: q, session_id: sessionId },
        {
          onChunk: (text) => {
            streamed += text;
            setStreamingText(streamed);
          },
          onDone: (meta) => {
            setMessages((prev) => [
              ...prev,
              {
                role: "bot",
                text: streamed,
                meta: {
                  used_chunks: meta.used_chunks,
                  data_sufficient: meta.data_sufficient,
                  note: meta.note
                }
              }
            ]);
            setStreamingText("");
            setLoading(false);
            if (!sessionId && meta.session_id) {
              setActiveId(meta.session_id);
              setConversations((prev) => {
                const exists = prev.find((c) => c.id === meta.session_id);
                if (exists) return prev;
                return [
                  { id: meta.session_id, title: q.slice(0, 50) + (q.length > 50 ? "..." : ""), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
                  ...prev
                ];
              });
            } else if (sessionId) {
              setConversations((prev) =>
                prev.map((c) =>
                  c.id === sessionId ? { ...c, title: c.title || q.slice(0, 50) + (q.length > 50 ? "..." : "") } : c
                )
              );
            }
          },
          onError: (err) => {
            setError(err.message || "Lỗi kết nối streaming");
            setLoading(false);
            setStreamingText("");
          }
        }
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không gọi được API /chat");
      setLoading(false);
      setStreamingText("");
    }
  }

  const suggestions = messages.length === 0 && !loading ? (
    <div className="flex flex-wrap justify-center gap-2">
      {samples.map((sample) => (
        <button
          key={sample}
          type="button"
          onClick={() => setQuery(sample)}
          className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:border-slate-400"
        >
          {sample}
        </button>
      ))}
    </div>
  ) : null;

  return (
    <Shell fullWidth>
      <div className="flex h-[calc(100vh-57px)] overflow-hidden">

        <aside className="hidden w-64 flex-shrink-0 flex-col border-r border-slate-200 bg-slate-50 sm:flex">
          <div className="p-3">
            <button
              type="button"
              onClick={createConversation}
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
            >
              <span>+</span> Cuộc trò chuyện mới
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-3 pb-3">
            {conversations.length === 0 ? (
              <p className="px-2 py-4 text-center text-xs text-slate-400">Chưa có cuộc trò chuyện nào</p>
            ) : (
              <ul className="space-y-1">
                {conversations.map((conv) => {
                  const active = activeId === conv.id;
                  return (
                    <li key={conv.id}>
                      <button
                        type="button"
                        onClick={() => loadConversation(conv.id)}
                        className={`group flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition ${active ? "bg-teal-100 text-teal-900" : "text-slate-700 hover:bg-slate-200"}`}
                      >
                        <span className="truncate">{conv.title}</span>
                        <span
                          onClick={(e) => deleteConversation(e, conv.id)}
                          className="ml-2 hidden rounded p-0.5 text-xs text-slate-400 hover:bg-slate-300 hover:text-slate-700 group-hover:block"
                        >
                          ×
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </aside>


        <section className="flex flex-1 flex-col bg-white">

          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <h1 className="text-sm font-semibold text-slate-800">
              {activeId ? conversations.find((c) => c.id === activeId)?.title || "Cuộc trò chuyện" : "Cuộc trò chuyện mới"}
            </h1>
            <div className="sm:hidden">
              <button
                type="button"
                onClick={createConversation}
                disabled={loading}
                className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700"
              >
                + Mới
              </button>
            </div>
          </div>


          <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
            {messages.length === 0 && !streamingText ? (
              <div className="flex h-full flex-col items-center justify-center space-y-6">
                <div className="text-center">
                  <h2 className="text-2xl font-semibold text-slate-900">Tư vấn tuyển sinh</h2>
                  <p className="mt-2 text-sm text-slate-500">Bạn có thể hỏi tự nhiên về điểm chuẩn, học phí, ngành đào tạo...</p>
                </div>
                {suggestions}
              </div>
            ) : (
              <div className="mx-auto w-full max-w-3xl space-y-4">
                {messages.map((msg, idx) => (
                  <article
                    key={`${msg.role}-${idx}`}
                    className={msg.role === "user" ? "flex justify-end" : "flex justify-start"}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed sm:max-w-[75%] ${
                        msg.role === "user"
                          ? "rounded-br-sm bg-teal-700 text-white"
                          : "rounded-bl-sm border border-slate-200 bg-white text-slate-800 shadow-sm"
                      }`}
                    >
                      {msg.role === "bot" ? (
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={{
                            p: ({ children }) => <p className="whitespace-pre-wrap">{children}</p>,
                            ul: ({ children }) => <ul className="list-disc pl-5">{children}</ul>,
                            ol: ({ children }) => <ol className="list-decimal pl-5">{children}</ol>,
                            li: ({ children }) => <li className="mb-1">{children}</li>,
                            table: ({ children }) => (
                              <div className="my-2 overflow-x-auto rounded-lg border border-slate-200">
                                <table className="min-w-full border-collapse text-xs sm:text-sm">{children}</table>
                              </div>
                            ),
                            thead: ({ children }) => <thead className="bg-slate-100">{children}</thead>,
                            tbody: ({ children }) => <tbody>{children}</tbody>,
                            tr: ({ children }) => <tr className="odd:bg-white even:bg-slate-50/60">{children}</tr>,
                            th: ({ children }) => (
                              <th className="border-b border-slate-200 px-2 py-1.5 text-left font-semibold text-slate-800">
                                {children}
                              </th>
                            ),
                            td: ({ children }) => (
                              <td className="border-b border-slate-100 px-2 py-1.5 align-top text-slate-700">{children}</td>
                            ),
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
                      ) : (
                        <p className="whitespace-pre-wrap">{msg.text}</p>
                      )}
                    </div>
                    {msg.role === "bot" && msg.meta ? (
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <span>Nguồn tham chiếu: {msg.meta.used_chunks} đoạn dữ liệu</span>
                        {msg.meta.note ? <span>· {msg.meta.note}</span> : null}
                      </div>
                    ) : null}
                  </article>
                ))}

                {streamingText ? (
                  <article className="flex justify-start">
                    <div className="max-w-[85%] rounded-2xl rounded-bl-sm border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 shadow-sm sm:max-w-[75%]">
                      <div className="flex items-start gap-2">
                        <span className="mt-1.5 inline-block h-2 w-2 animate-pulse rounded-full bg-teal-600" />
                        <div className="leading-relaxed">
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                              p: ({ children }) => <p className="whitespace-pre-wrap">{children}</p>,
                              ul: ({ children }) => <ul className="list-disc pl-5">{children}</ul>,
                              ol: ({ children }) => <ol className="list-decimal pl-5">{children}</ol>,
                              li: ({ children }) => <li className="mb-1">{children}</li>,
                              table: ({ children }) => (
                                <div className="my-2 overflow-x-auto rounded-lg border border-slate-200">
                                  <table className="min-w-full border-collapse text-xs sm:text-sm">{children}</table>
                                </div>
                              ),
                              thead: ({ children }) => <thead className="bg-slate-100">{children}</thead>,
                              tbody: ({ children }) => <tbody>{children}</tbody>,
                              tr: ({ children }) => <tr className="odd:bg-white even:bg-slate-50/60">{children}</tr>,
                              th: ({ children }) => (
                                <th className="border-b border-slate-200 px-2 py-1.5 text-left font-semibold text-slate-800">
                                  {children}
                                </th>
                              ),
                              td: ({ children }) => (
                                <td className="border-b border-slate-100 px-2 py-1.5 align-top text-slate-700">{children}</td>
                              ),
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
                            {streamingText}
                          </ReactMarkdown>
                        </div>
                      </div>
                    </div>
                  </article>
                ) : null}

                {loading && !streamingText ? (
                  <article className="flex justify-start">
                    <div className="max-w-[85%] rounded-2xl rounded-bl-sm border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm sm:max-w-[75%]">
                      <div className="flex items-center gap-2">
                        <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-teal-700" />
                        <span>AI đang tìm kiếm thông tin...</span>
                      </div>
                    </div>
                  </article>
                ) : null}
              </div>
            )}
          </div>


          <div className="border-t border-slate-200 bg-white px-4 py-3">
            <div className="mx-auto w-full max-w-3xl">
              {error ? <p className="mb-2 text-xs text-rose-700">{error}</p> : null}
              <form onSubmit={onSubmit} className="flex items-end gap-2 rounded-2xl border border-slate-300 bg-slate-50 p-2 focus-within:border-teal-600 focus-within:ring-1 focus-within:ring-teal-600">
                <textarea
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      if (canSend) onSubmit(e as unknown as FormEvent);
                    }
                  }}
                  rows={1}
                  placeholder="Nhập câu hỏi..."
                  className="max-h-32 w-full resize-none bg-transparent px-2 py-2 text-sm outline-none"
                />
                <button
                  type="submit"
                  disabled={!canSend}
                  className="rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Gửi
                </button>
              </form>
              <p className="mt-1 text-center text-[11px] text-slate-400">
                Nếu dữ liệu thiếu, hệ thống sẽ trả lời rõ ràng thay vì suy đoán.
              </p>
            </div>
          </div>
        </section>
      </div>
    </Shell>
  );
}
