# Admission RAG Chatbot Backend (NestJS + Qdrant)

Backend được viết lại bằng **NestJS + TypeScript**, thay thế backend Python/FastAPI cũ. Sử dụng **Qdrant** làm vector database thay cho ChromaDB.

## Kiến trúc

```
src/
  config/              # AppConfigService (env vars)
  modules/
    health/            # GET /api/v1/health
    qdrant/            # Qdrant client wrapper
    embedding/         # Xenova/transformers (local embedding)
    ingest/            # POST /api/v1/ingest
    search/            # POST /api/v1/search
    chat/              # POST /api/v1/chat
    llm/               # OpenRouter integration
```

## Hybrid RAG

Hệ thống lưu trữ 2 loại chunk trong Qdrant:

| Loại | chunk_type | Mục đích |
|---|---|---|
| **QA Pair** | `qa_pair` | Fact lookup (điểm chuẩn, mã ngành) — precision cao |
| **Raw Document** | `raw_document` | Open-ended (đề án, học phí, giới thiệu) — coverage cao |

Mỗi chunk có metadata đầy đủ: `university_code`, `intent`, `domain`, `source`, `confidence`.

## Cài đặt

```bash
cd backend-new
npm install
```

## Chạy Qdrant (Docker)

```bash
docker run -p 6333:6333 -v $(pwd)/qdrant_storage:/qdrant/storage qdrant/qdrant
```

## Environment Variables

Tạo file `.env`:

```env
PORT=8000
QDRANT_URL=http://localhost:6333
QDRANT_COLLECTION=admission_chunks
EMBEDDING_MODEL=Xenova/paraphrase-multilingual-MiniLM-L12-v2
EMBEDDING_DIM=384
OPENROUTER_API_KEY=sk-or-v1-...
OPENROUTER_MODEL=openai/gpt-oss-120b:free
TOP_K=8
CANDIDATE_K=100
```

## Chạy dev

```bash
npm run start:dev
```

## Build production

```bash
npm run build
npm run start:prod
```

## API Endpoints

| Method | Endpoint | Body | Mô tả |
|---|---|---|---|
| GET | `/api/v1/health` | — | Health check |
| POST | `/api/v1/ingest` | `{ rebuild_index?: boolean }` | Index dữ liệu vào Qdrant |
| POST | `/api/v1/search` | `{ query, university_code?, top_k? }` | Vector search |
| POST | `/api/v1/chat` | `{ query, session_id?, university_code? }` | Chat với RAG |

## Ingest dữ liệu

```bash
curl -X POST http://localhost:8000/api/v1/ingest \
  -H "Content-Type: application/json" \
  -d '{"rebuild_index": true}'
```

## Chat

```bash
curl -X POST http://localhost:8000/api/v1/chat \
  -H "Content-Type: application/json" \
  -d '{"query": "Điểm chuẩn CNTT BKA bao nhiêu?"}'
```
