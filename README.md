# PatchSense PR Guard

AI-powered GitHub PR code reviewer. Point it at any repo, open a PR, and three specialized agents automatically analyze the diff for security vulnerabilities, performance issues, and style problems — no manual intervention needed.

---

## How it works

1. A PR is opened or a commit is pushed → GitHub fires a webhook
2. The FastAPI backend receives the event, fetches the diff from GitHub
3. Three LangChain + Gemini agents run in parallel over the diff
4. Findings are stored in Supabase
5. The React dashboard updates in real time via polling

```
GitHub webhook → FastAPI → LangChain agents (Security · Performance · Style)
                                    ↓
                              Supabase (reviews + findings)
                                    ↓
                           React dashboard (live polling)
```

---

## Stack

| Layer | Tech |
|---|---|
| Backend | FastAPI · Python 3.11 · uvicorn |
| AI agents | LangChain · Gemini (`gemini-1.5-flash`) · LangSmith tracing |
| Database | Supabase (Postgres + PostgREST) |
| Frontend | React 18 · TypeScript · Vite |
| Deploy | Render (Docker, free tier) |

---

## Agents

| Agent | What it checks |
|---|---|
| **Security** | Injections, hardcoded secrets, auth flaws, exposed data |
| **Performance** | N+1 queries, blocking I/O, memory leaks, inefficient loops |
| **Style** | Naming, dead code, complexity, missing error handling |

Each agent returns findings with a severity (`critical` / `high` / `medium` / `low` / `info`), file path, line number, and a fix suggestion.

---

## Local development

### Prerequisites

- Python 3.11+
- Node 18+
- A Supabase project
- A GitHub PAT with `repo` scope
- A Gemini API key

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
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_KEY=<anon key>
SUPABASE_SECRET_KEY=<service role JWT>
GITHUB_PAT=ghp_...
GITHUB_WEBHOOK_SECRET=<any secret string>
GEMINI_API_KEY=...
LANGCHAIN_API_KEY=...          # optional — enables LangSmith tracing
LANGCHAIN_TRACING_V2=true      # optional
```

### Supabase tables

Run this once in the Supabase SQL editor:

```sql
create table reviews (
  id uuid primary key default gen_random_uuid(),
  repo_full_name text not null,
  pr_number int not null,
  pr_title text,
  pr_state text default 'open',
  status text not null default 'pending',
  created_at timestamptz default now(),
  completed_at timestamptz
);

create table findings (
  id uuid primary key default gen_random_uuid(),
  review_id uuid references reviews(id) on delete cascade,
  agent text not null,
  severity text not null,
  file_path text not null,
  line_number int,
  message text not null,
  suggestion text
);

-- Allow backend (service role) to write; frontend (anon) to read
alter table reviews enable row level security;
alter table findings enable row level security;

create policy "service_role_all" on reviews for all using (true);
create policy "anon_select" on reviews for select using (true);
create policy "service_role_all" on findings for all using (true);
create policy "anon_select" on findings for select using (true);
```

---

## Connecting a repo

1. Go to the repo → **Settings → Webhooks → Add webhook**
2. Payload URL: `https://patchsense-prguard-1.onrender.com/webhook`
3. Content type: `application/json`
4. Secret: your `GITHUB_WEBHOOK_SECRET`
5. Events: select **Pull requests** only
6. Save — any new PR now triggers an AI review automatically

Works with any number of repos. All reviews appear in the same dashboard.

---

## Deploy (Render)

The repo includes a `render.yaml` for one-click deploy:

```bash
# In Render dashboard → New → Blueprint → point to this repo
# Set all env vars listed above
```

Docker context is `./backend`, Dockerfile is `./backend/Dockerfile`.

---

## Dashboard features

- **Open / Merged / All** toggle — shows only open PRs by default
- **Status filters** — All · Pending · Running · Completed · Failed with live counts
- **Agent filters** — All · Security · Performance · Style
- Live status dot — pulses while a review is running
- Per-finding expand for fix suggestions
- Auto-polls every 4 s while a review is active; 30 s heartbeat otherwise so new PRs appear without refresh
- **Connect Repo** drawer with copy-ready webhook URL and setup steps
