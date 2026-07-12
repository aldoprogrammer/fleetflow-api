# fleetflow-api

> **FleetFlow Production Board** · [View Kanban Board →](https://github.com/users/aldoprogrammer/projects/2)

NestJS core API for FleetFlow — orders, dispatch, payments, and queue orchestration.

## Stack

- NestJS · Prisma · PostgreSQL · Redis · BullMQ · Stripe
- Shared contracts via `@fleetflow/shared`

## Quick start

```bash
# Ensure Postgres + Redis are running (fleetflow-infra)
cd ../fleetflow-infra
docker compose up -d

cd ../fleetflow-api
pnpm install
npx prisma migrate deploy
npx prisma db seed
pnpm run start:dev
```

API: `http://localhost:3000/v1` · Swagger: `http://localhost:3000/docs`

## Prisma commands

> **Important:** `schema.prisma` lives in **`fleetflow-api/prisma/`**, not the monorepo root.  
> Running `npx prisma studio` from the root causes **"Could not find Prisma Schema"**.

### Correct ways to run Prisma (pick one)

**Option A — from the API folder (recommended):**
```bash
cd fleetflow-api
npx prisma studio
```

**Option B — from the monorepo root (pnpm script):**
```bash
pnpm prisma:studio
```

**Option C — from the root with an explicit `--schema`:**
```bash
npx prisma studio --schema fleetflow-api/prisma/schema.prisma
```

Run all Prisma commands from **`fleetflow-api`**, or use `pnpm prisma:*` scripts from the root.

| Command | When to use |
|---------|-------------|
| `npx prisma generate` | After editing `prisma/schema.prisma` — regenerate Prisma Client |
| `npx prisma migrate dev --name <name>` | Dev: create and apply a new migration |
| `npx prisma migrate deploy` | Production/CI: apply existing migrations |
| `npx prisma db push` | Fast prototyping — sync schema without migration files (avoid in production) |
| `npx prisma db seed` | Load bootstrap data (drivers, etc.) |
| `npx prisma studio` | Open the browser GUI for PostgreSQL |

```bash
cd fleetflow-api

# Regenerate client after schema changes
pnpm prisma:generate
# or: npx prisma generate

# Dev: create + apply migration
pnpm prisma:migrate
# or: npx prisma migrate dev --name init_orders

# Quick schema sync (no migration file)
pnpm prisma:push
# or: npx prisma db push

# Seed driver data
pnpm prisma:seed
# or: npx prisma db seed

# Database GUI (http://localhost:5555)
pnpm prisma:studio
# or: npx prisma studio
```

**Typical flow after a schema change:**
1. `cd fleetflow-api`
2. Edit `prisma/schema.prisma`
3. `npx prisma migrate dev --name <description>` *(or `db push` for experiments)*
4. `npx prisma generate` *(run automatically by `migrate dev`)*
5. `npx prisma db seed` *(if bootstrap data must be refreshed)*

**Prisma troubleshooting checklist:**
- [ ] Did you `cd fleetflow-api`?
- [ ] Is Postgres running (`docker compose up -d`)?
- [ ] Is `fleetflow-api/.env` correct (`DATABASE_URL`)?
- [ ] Did you run `npx prisma generate` after schema changes?

## Testing & QA

| Command | What it does |
|---------|--------------|
| `pnpm qa:verify-redis-queue` | **1 order** — smoke test: Redis + BullMQ + worker OK? |
| `pnpm qa:load-test-dispatch` | **50 orders at once** (default) — fill the queue |
| `node scripts/load-test-dispatch.mjs --total=100 --concurrency=25` | **100 orders**, 25 per batch — change numbers as needed |
| `pnpm qa:watch-dispatch-queue` | Watch `waiting`/`active` live — terminal 1 |
| `pnpm qa:reset-drivers` | Reset drivers stuck `ON_TRIP` |

Full guide: [fleetflow-docs/QA_TESTING.md](../fleetflow-docs/QA_TESTING.md)

## Redis & BullMQ

Matching is async: `POST /orders` → Redis queue → worker assigns driver.

**Start API first** (required before any CLI below):

```powershell
cd fleetflow-infra; docker compose up -d postgres redis
cd ../fleetflow-api
pnpm prisma:deploy; pnpm prisma:seed
pnpm run start:dev   # API + BullMQ worker must be running
```

**Queue QA CLI — copy & paste:**

```powershell
# 1 order only — pass/fail: is Redis + BullMQ + worker working?
pnpm qa:verify-redis-queue

# 50 orders at once (default) — fill Redis queue, see before/after in output
pnpm qa:load-test-dispatch

# 100 orders, 25 per batch — custom count (change numbers as needed)
node scripts/load-test-dispatch.mjs --total=100 --concurrency=25

# Live monitor: waiting goes down, active goes up — run in terminal 1, leave it open
pnpm qa:watch-dispatch-queue

# Drivers stuck ON_TRIP — run before re-testing if many orders get CANCELLED
pnpm qa:reset-drivers
```

**Live demo (2 terminals):**

```powershell
# Terminal 1 — watch queue counts update every second
pnpm qa:watch-dispatch-queue

# Terminal 2 — fire 100 orders (25 per batch)
node scripts/load-test-dispatch.mjs --total=100 --concurrency=25
```

**Troubleshooting**

| Symptom | Fix |
|---------|-----|
| `ECONNREFUSED` / API not reachable | `pnpm run start:dev` in `fleetflow-api` |
| `ECONNREFUSED` Redis | `docker compose up -d redis` in `fleetflow-infra` |
| Order stuck `PENDING` | API must be running — worker lives in API process |
| `CANCELLED` | `pnpm qa:reset-drivers` then `pnpm prisma:seed` |

## Related repos

| Repo | Role |
|------|------|
| [fleetflow-shared](https://github.com/aldoprogrammer) | Shared Zod contracts |
| [fleetflow-web](https://github.com/aldoprogrammer) | Operations portal |
| [fleetflow-app](https://github.com/aldoprogrammer) | Driver mobile app |
| [fleetflow-infra](https://github.com/aldoprogrammer) | Docker & local HA |
| [fleetflow-docs](https://github.com/aldoprogrammer) | Architecture docs |

## GitHub About (recommended)

Set **Website** in repo **About** → `https://github.com/users/aldoprogrammer/projects/2`
