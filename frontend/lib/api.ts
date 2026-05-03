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
  process.env.NEXT_PUBLIC_API_BASE_URL?.trim() || "http://localhost:8000/api/v1";

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

export const api = {
  health: () => request<HealthResponse>("/health"),
  chat: (payload: ChatRequest) =>
    request<ChatResponse>("/chat", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  search: (payload: SearchRequest) =>
    request<SearchResponse>("/search", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  ingest: (payload: IngestRequest) =>
    request<IngestResponse>("/ingest", {
      method: "POST",
      body: JSON.stringify(payload)
    })
};
