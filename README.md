# PatchSense PR Guard

AI-powered GitHub PR code reviewer with multi-user access, auto-fix, and a real-time dashboard. Connect any repo, open a PR, and three specialized LangChain + Gemini agents automatically analyze the diff for security vulnerabilities, performance issues, and style problems — no manual intervention needed.

---

## How it works

1. A PR is opened or updated → GitHub fires a webhook
2. The FastAPI backend receives the event and fetches the diff
3. Three LangChain + Gemini 2.5 Flash agents run in parallel
4. Findings are stored in Supabase and streamed to the dashboard via SSE
5. Users can apply AI-generated fixes as a direct commit or a new PR

```
GitHub webhook → FastAPI → LangChain agents (Security · Performance · Style)
                                    ↓
                              Supabase (reviews + findings)
                                    ↓
                    React dashboard (live SSE stream → polling fallback)
```

---

## Stack

| Layer | Tech |
|---|---|
| Backend | FastAPI · Python 3.11 · uvicorn |
| AI agents | LangChain · Gemini 2.5 Flash · LangSmith tracing |
| Database | Supabase (Postgres + Auth + PostgREST) |
| Frontend | React 18 · TypeScript · Vite · Tailwind CSS · shadcn/ui |
| Deploy | Render (Docker) |

---

## Features

### Review pipeline

- **Three parallel agents** — Security, Performance, and Style analyze every PR diff independently
- **Severity ratings** — `critical` / `high` / `medium` / `low` / `info` per finding
- **Live streaming** — review status pushed to the dashboard via SSE; falls back to 5 s polling if SSE is unavailable
- **Status filters** — All · Pending · Running · Completed · Failed with live counts
- **Agent filters** — filter findings by Security, Performance, or Style

### AI auto-fix

- **Generate fix** — click a finding to have the AI produce a unified diff patch
- **Apply as commit** — patch is committed directly to the PR branch
- **Apply as PR** — patch is committed to a new `patchsense/fix-*` branch and a fix PR is opened
- Commits are attributed to **PatchSense Bot** (`bot@patchsense.dev`), never to the server PAT owner
- The triggering user's GitHub login appears in the `Co-authored-by` commit trailer and the fix-PR body

### Repo management

- **Connect Repo wizard** — paste a GitHub URL; the backend auto-installs the webhook using the user's OAuth token
- **Pause / Resume** — toggle a repo off without disconnecting it; paused repos show a clear indicator
- **Disconnect** — removes the webhook and the repo from PatchSense in one step
- **Member invites** — repo owners can invite collaborators by GitHub username; invited users see the shared repo immediately after signing in with GitHub

### Multi-user access

- GitHub OAuth sign-in via Supabase Auth
- Each user sees only their own repos and shared repos they have been invited to
- Member repos show the owner's GitHub login for easy attribution
- Invited users who haven't signed up yet are stored as pending — they gain access automatically on first login

### Admin dashboard (admin users only)

- **Stats overview** — total users, total/active/inactive repos, completed/failed reviews, MRR estimate
- **Users tab** — plan filter pills (All · Free · Pro · Team), repo and review counts per user
- **Repos tab** — all repos across all users with active state
- **Activity tab** — last 25 reviews across the platform with status badges

---

## Agents

| Agent | What it checks |
|---|---|
| **Security** | Injections, hardcoded secrets, auth flaws, exposed data |
| **Performance** | N+1 queries, blocking I/O, memory leaks, inefficient loops |
| **Style** | Naming, dead code, complexity, missing error handling |

Each agent returns findings with severity, file path, line number, a human-readable message, and a fix suggestion.

---

## Local development

### Prerequisites

- Python 3.11+
- Node 18+
- A Supabase project (Auth + Database)
- A GitHub OAuth App (for Supabase Auth provider)
- A GitHub PAT with `repo` scope (server-level fallback)
- A Gemini API key
- (Optional) A LangSmith API key for tracing

### Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # fill in values
uvicorn app.main:app --reload
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The frontend proxies `/api` to `http://localhost:8000`.

### Environment variables

```
# Supabase
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_KEY=<anon key>
SUPABASE_SECRET_KEY=<service role JWT>

# GitHub
GITHUB_PAT=ghp_...              # server-level PAT; user OAuth token takes precedence for writes
GITHUB_WEBHOOK_SECRET=<secret>

# AI
GEMINI_API_KEY=...

# LangSmith (optional)
LANGCHAIN_API_KEY=...
LANGCHAIN_TRACING_V2=true
LANGCHAIN_PROJECT=patchsense

# Frontend (Vite)
VITE_API_URL=http://localhost:8000
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
```

### Supabase setup

Run the migrations in `backend/migrations/` against your Supabase project in order. Key tables:

| Table | Purpose |
|---|---|
| `profiles` | One row per user — plan, github_login, avatar_url, is_admin |
| `repos` | Connected repos — owner_id, full_name, webhook_id, active |
| `repo_members` | Collaborator access — repo_id, user_id, github_login, role |
| `reviews` | PR review records — repo, pr_number, status, findings (JSONB) |
| `findings` | Individual findings from each agent, with optional patch |

Row-level security is enabled on all tables. The service role key bypasses RLS for webhook writes; the anon key is used for authenticated reads scoped to the logged-in user.

---

## Connecting a repo

The **Connect Repo** wizard in the dashboard handles everything:

1. Sign in with GitHub
2. Click **Connect Repo** and paste a GitHub repo URL
3. PatchSense installs the webhook automatically using your GitHub OAuth token
4. Any new PR triggers an AI review — no further configuration needed

Repos can be shared with teammates via **Settings → Members** on the repo card.

---

## Deploy (Render)

The repo includes a `render.yaml` for one-click deploy:

```
Render dashboard → New → Blueprint → point to this repo → set env vars
```

Docker context is `./backend`, Dockerfile is `./backend/Dockerfile`. The frontend is served as a static build from the same service or can be deployed separately to any static host (Vercel, Netlify, etc.).

---

## Commit attribution

All commits and PRs created by PatchSense via the auto-fix feature are attributed to **PatchSense Bot** (`bot@patchsense.dev`), not to the server PAT owner. When a user triggers a fix, their GitHub login appears in the `Co-authored-by` commit trailer and the fix-PR body, so contribution history remains accurate for all parties.
