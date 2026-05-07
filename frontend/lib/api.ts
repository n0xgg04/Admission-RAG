export type HealthResponse = {
  status: string;
  app: string;
  env: string;
};

export type ChatRequest = {
  query: string;
  session_id?: string | null;
  university_code?: string | null;
};

export type ChatResponse = {
  answer: string;
  session_id: string | null;
  used_chunks: number;
  data_sufficient: boolean;
  note: string | null;
};

export type SearchRequest = {
  query: string;
  top_k?: number | null;
  university_code?: string | null;
  method_id?: string | null;
  program_code?: string | null;
  program_type?: string | null;
};

export type SearchHit = {
  chunk_id: string;
  score: number;
  text: string;
  metadata: Record<string, unknown>;
};

export type SearchResponse = {
  hits: SearchHit[];
};

export type IngestRequest = {
  data_dir?: string | null;
  rebuild_index: boolean;
};

export type IngestResponse = {
  status: string;
  universities_processed: number;
  chunks_created: number;
  collection_size: number;
  message: string;
};

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL?.trim() || "https://backend-new-dun-two.vercel.app/api/v1";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {})
    },
    cache: "no-store"
  });
  if (!res.ok) {
    const message = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${message}`);
  }
  return (await res.json()) as T;
}

export type Conversation = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

export type ConversationListResponse = {
  conversations: Conversation[];
};

export type ChatStreamCallbacks = {
  onChunk: (text: string) => void;
  onDone: (meta: {
    session_id: string;
    used_chunks: number;
    data_sufficient: boolean;
    note: string | null;
  }) => void;
  onError: (err: Error) => void;
};

export const api = {
  health: () => request<HealthResponse>("/health"),
  chat: (payload: ChatRequest) =>
    request<ChatResponse>("/chat", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  chatStream: async (payload: ChatRequest, callbacks: ChatStreamCallbacks) => {
    try {
      const res = await fetch(`${API_BASE}/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!res.ok || !res.body) {
        const text = await res.text();
        throw new Error(`${res.status}: ${text}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith("data: ")) {
            try {
              const data = JSON.parse(trimmed.slice(6));
              if (data.chunk !== undefined) {
                callbacks.onChunk(data.chunk);
              } else if (data.done) {
                callbacks.onDone(data);
              }
            } catch {
            }
          }
        }
      }
    } catch (err) {
      callbacks.onError(err instanceof Error ? err : new Error(String(err)));
    }
  },
  search: (payload: SearchRequest) =>
    request<SearchResponse>("/search", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  ingest: (payload: IngestRequest) =>
    request<IngestResponse>("/ingest", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  conversations: {
    list: () => request<ConversationListResponse>("/conversations"),
    create: (title?: string) =>
      request<{ conversation: Conversation }>("/conversations", {
        method: "POST",
        body: JSON.stringify({ title })
      }),
    get: (id: string) => request<{ conversation: Conversation & { messages?: Array<{ role: string; content: string; timestamp: string }> } }>(`/conversations/${id}`),
    delete: (id: string) => request<{ success: boolean }>(`/conversations/${id}`, { method: "DELETE" }),
    addMessage: (id: string, role: string, content: string) =>
      request<{ conversation: Conversation }>(`/conversations/${id}/messages`, {
        method: "POST",
        body: JSON.stringify({ role, content })
      })
  }
};
