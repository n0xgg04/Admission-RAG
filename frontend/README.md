# Frontend

Next.js frontend for the admission RAG chatbot (localhost scope).

## Requirements

- Node.js 18+
- npm 9+

## Setup

```bash
npm install
cp .env.example .env.local
```

Set API base URL in `.env.local` if needed:

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000/api/v1
```

## Run development server

```bash
npm run dev
```

- App: `http://localhost:3000`

## Build for production

```bash
npm run build
npm run start
```

## Main pages

- `/` Landing page
- `/chatbot` Chat experience for admission Q&A
- `/truy-van` School information and cutoff lookup table

## Notes

- Chat session is created automatically by backend on first question.
- Chatbot keeps short-term memory of the last 5 user questions per session.
- Query page reads cleaned data from `../data` through internal API routes.
