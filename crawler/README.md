# admission-rag-chatbot

A localhost-first RAG chatbot for university admission consulting.

This project helps students and parents:
- chat for admission Q&A,
- look up school information,
- browse cutoff scores in a table view.

The system prioritizes correctness from internal data over generic model responses.

## Repository Structure

- `backend/` FastAPI API for ingest, retrieval, and chat generation
- `frontend/` Next.js web app for end users
- `data/` cleaned admission datasets used by the project
- `docs/` project notes and requirements

## Tech Stack

- Frontend: Next.js + Tailwind CSS
- Backend: FastAPI (Python)
- Vector store: Chroma (persisted on disk)
- LLM provider: OpenRouter

## Quick Start

### 1) Start backend

See full instructions in `backend/README.md`.

Typical flow:

```bash
cd backend
python -m venv .venv
# activate virtual environment
pip install -r requirements.txt
cp .env.example .env
```

Set `OPENROUTER_API_KEY` in `.env`, then run:

```bash
make dev
```

Backend runs at `http://localhost:8000`.

### 2) Start frontend

See full instructions in `frontend/README.md`.

```bash
cd frontend
npm install
cp .env.example .env.local
npm run dev
```

Frontend runs at `http://localhost:3000`.

## Main API Endpoints

- `GET /api/v1/health`
- `POST /api/v1/ingest`
- `POST /api/v1/search`
- `POST /api/v1/chat`

## Data Notes

- Cleaned data is stored in `data/`.
- Dataset scope is admission season 2025.
- If information is missing, chatbot is expected to say so clearly instead of guessing.

## License

This repository is for educational/demo purposes.
