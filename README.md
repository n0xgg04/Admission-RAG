# Admission RAG Chatbot

A Retrieval-Augmented Generation (RAG) chatbot system for admission inquiries, built with a modular architecture comprising a data crawler, a NestJS backend, and a Next.js frontend.

## Overview

This project provides an intelligent chatbot capable of answering admission-related questions by retrieving relevant information from a vector database (Qdrant) and generating contextual responses using Large Language Models (LLM) via LangChain.

## Project Structure

The repository is organized into three main modules:

```
admission-rag-chatbot/
├── crawler/        # Data acquisition module
├── backend-new/    # API & RAG engine
└── frontend/       # User interface
```

### 1. Crawler (`crawler/`)

Responsible for collecting and processing raw admission data from various sources.

- **Technology:** Node.js, TypeScript, Playwright
- **Function:** Automated web scraping and data extraction
- **Entry Point:** `src/index.ts`

```bash
cd crawler
npm install
npm run crawl
```

### 2. Backend (`backend-new/`)

The core API and RAG processing engine.

- **Framework:** [NestJS](https://nestjs.com/)
- **Database:** PostgreSQL (via Prisma ORM)
- **Vector Store:** [Qdrant](https://qdrant.tech/)
- **LLM Integration:** LangChain with OpenAI
- **API Documentation:** Swagger/OpenAPI

**Key Dependencies:**
- `@nestjs/core`, `@nestjs/common` - NestJS framework
- `@prisma/client` - Database ORM
- `@qdrant/js-client-rest` - Vector database client
- `langchain`, `@langchain/openai` - LLM orchestration
- `class-validator`, `class-transformer` - DTO validation

**Development:**
```bash
cd backend-new
npm install
npx prisma generate
npm run start:dev
```

The API will be available at `http://localhost:3000` (default). Swagger docs are typically at `/api`.

### 3. Frontend (`frontend/`)

The user-facing chat interface.

- **Framework:** [Next.js](https://nextjs.org/) 14 (App Router)
- **UI Library:** React 18, TailwindCSS
- **Markdown Rendering:** `react-markdown`, `remark-gfm`

**Development:**
```bash
cd frontend
npm install
npm run dev
```

The application will be available at `http://localhost:3001` (or as configured).

## Prerequisites

- **Node.js:** >= 18.x
- **Package Manager:** npm
- **External Services:**
  - PostgreSQL database
  - Qdrant vector database instance
  - OpenAI API key

## Environment Setup

Each module requires its own environment configuration. Create `.env` files based on the provided examples:

### Backend (`backend-new/.env`)
```env
DATABASE_URL="postgresql://user:password@localhost:5432/admission_db"
QDRANT_URL="http://localhost:6333"
QDRANT_API_KEY="your-qdrant-api-key"
OPENAI_API_KEY="sk-your-openai-key"
```

### Frontend (`frontend/.env.local`)
```env
NEXT_PUBLIC_API_URL="http://localhost:3000"
```

## Quick Start

1. **Install dependencies for all modules:**
```bash
# In each directory: crawler/, backend-new/, frontend/
npm install
```

2. **Set up the database:**
```bash
cd backend-new
npx prisma migrate dev
npx prisma generate
```

3. **Run data crawler (if needed):**
```bash
cd crawler
npm run crawl
```

4. **Start the backend:**
```bash
cd backend-new
npm run start:dev
```

5. **Start the frontend:**
```bash
cd frontend
npm run dev
```

## Architecture

```mermaid
graph LR
    A[User] -->|Queries| B[Frontend Next.js]
    B -->|HTTP| C[Backend NestJS]
    C -->|Retrieve| D[Qdrant Vector DB]
    C -->|Generate| E[OpenAI LLM]
    C -->|Persist| F[PostgreSQL]
    G[Crawler] -->|Ingest| D
```

## Tech Stack Summary

| Layer        | Technology                              |
|--------------|-----------------------------------------|
| Frontend     | Next.js, React, TailwindCSS             |
| Backend      | NestJS, Prisma, Swagger                 |
| AI/ML        | LangChain, OpenAI, Qdrant               |
| Crawler      | Playwright, TypeScript                  |
| Database     | PostgreSQL                              |
| Vector Store | Qdrant                                  |

## License

MIT
