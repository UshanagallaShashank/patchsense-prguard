# PatchSense — AI PR Guard

Multi-agent AI code reviewer that posts security, performance, and style feedback on every pull request.

## Stack

| Layer | Technology |
|---|---|
| Webhook receiver | FastAPI on Google Cloud Run |
| Job queue | Redis via Upstash + ARQ |
| Worker | Cloud Run Job |
| LLM | Google Gemini via LangChain |
| Monitoring | LangSmith |
| Database | PostgreSQL (Supabase in prod) |
| Auth | GitHub App JWT + installation tokens |
| Frontend | React + Vite on Vercel |

## Architecture

```
GitHub Webhook → FastAPI → ARQ Queue → Worker
                                           ↓
                          ┌────────────────────────────┐
                          │  Orchestrator (asyncio)    │
                          │  ├── Security Agent        │
                          │  ├── Performance Agent     │
                          │  └── Style Agent           │
                          └────────────────────────────┘
                                           ↓
                                    Merger Agent
                                           ↓
                               GitHub PR Comments
```

## Quick Start

```bash
git clone https://github.com/UshanagallaShashank/patchsense-prguard.git
cd patchsense-prguard
cp backend/.env.example backend/.env
# Fill in backend/.env
docker-compose up
```

## Feature Branches

| Branch | Scope |
|---|---|
| `feature/webhook-receiver` | FastAPI webhook + HMAC verification |
| `feature/github-auth` | GitHub App JWT + installation tokens |
| `feature/agent-security` | Security specialist agent |
| `feature/agent-performance` | Performance specialist agent |
| `feature/agent-style` | Style specialist agent |
| `feature/agent-merger` | Dedup, rank, format findings |
| `feature/queue-worker` | ARQ job queue + worker |
| `feature/db-models` | SQLAlchemy models + Alembic migrations |
| `feature/dashboard` | React + Vite frontend |

## Environment Variables

See `backend/.env.example` for all required variables.

## License

MIT
