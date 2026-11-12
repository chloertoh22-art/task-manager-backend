# Task Manager: Backend API

A small REST API for managing tasks, built with **Node.js + Express + MySQL**.
It's the backend half of a student lab for deploying to AWS (**EC2** + **RDS**).
The frontend lives in the `task-manager-frontend` repo.

👉 **Lab 1 — deploy on EC2 + RDS + Amplify: [DEPLOYMENT-GUIDE.md](DEPLOYMENT-GUIDE.md)**  
👉 **Lab 2 — run the API in a container on Amazon ECS: [LAB2-CONTAINERS-GUIDE.md](LAB2-CONTAINERS-GUIDE.md)**

## Run with Docker

```bash
docker compose up --build     # MySQL + the API, on http://localhost:3000
docker compose down           # stop (add -v to also delete the database data)
```
The server creates the database table and sample tasks by itself at startup (set `DB_AUTO_SETUP=false` to turn this off),
and keeps retrying while the database is unreachable.

## Run locally

Requires Node.js 22+ and a MySQL 8 server.

```bash
npm install
cp .env.example .env     # then set DB_PASSWORD etc.
npm run db:init          # creates database + "tasks" table + 3 sample tasks
npm run dev              # http://localhost:3000 (restarts when you edit files)
```

| Script | What it does |
|---|---|
| `npm start` | Start the API |
| `npm run dev` | Start with auto-restart on file changes |
| `npm run db:init` | Create the database, table and sample data (safe to re-run) |
| `npm test` | Run the tests (no database needed) |

## API

Base URL: `http://localhost:3000` locally, `https://<your-host>` on AWS.

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/health` | | `200 {"status":"ok","database":"ok"}` or `503` with an error `code` |
| GET | `/api/tasks` | | `200` array of tasks (newest first) |
| GET | `/api/tasks?status=done` | | `200` tasks filtered by status |
| GET | `/api/tasks/:id` | | `200` task · `404` |
| POST | `/api/tasks` | task JSON | `201` created task · `400` validation errors |
| PUT | `/api/tasks/:id` | task JSON | `200` updated task · `400` · `404` |
| DELETE | `/api/tasks/:id` | | `204` · `404` |

**Task JSON**
```jsonc
{
  "title": "Deploy the API",            // required, max 255 chars
  "description": "Use PM2 and Nginx",   // optional
  "status": "in_progress",              // todo | in_progress | done (default: todo)
  "due_date": "2026-12-01"              // optional, YYYY-MM-DD
}
```

**Validation error (400)**
```jsonc
{ "error": "Validation failed.", "details": ["Title is required."] }
```

Try it with curl:
```bash
curl http://localhost:3000/api/tasks
curl -X POST http://localhost:3000/api/tasks -H "Content-Type: application/json" -d '{"title":"My first task"}'
```

## Configuration (`.env`)

| Variable | Example | Notes |
|---|---|---|
| `PORT` | `3000` | Port the API listens on |
| `DB_HOST` | `localhost` / RDS endpoint | |
| `DB_PORT` | `3306` | |
| `DB_USER` | `admin` | |
| `DB_PASSWORD` | | Never commit this |
| `DB_NAME` | `taskmanager` | |
| `DB_SSL` | `true` on RDS, `false` locally | Encrypts the DB connection and verifies the RDS certificate (`certs/rds-global-bundle.pem`) |
| `CORS_ORIGIN` | `https://main.xxxx.amplifyapp.com` | Allowed website(s), comma separated. Empty = allow all (dev only) |
| `DB_AUTO_SETUP` | `true` (default) | Create the table and sample tasks at startup, retrying until the DB is reachable |

## Project structure

```
src/
  server.js          starts the server (loads .env)
  app.js             Express app: CORS, JSON, routes, error handling
  db.js              MySQL connection pool
  validation.js      task input validation
  routes/health.js   GET /api/health
  routes/tasks.js    CRUD for /api/tasks
db/
  schema.sql         CREATE TABLE tasks
  init.js            npm run db:init
certs/
  rds-global-bundle.pem  AWS's public RDS certificate bundle (all regions), used when DB_SSL=true
deploy/
  nginx.conf         Nginx reverse proxy template for EC2
ecosystem.config.cjs PM2 process config for EC2 (Lab 1)
Dockerfile           container image recipe (Lab 2)
docker-compose.yml   MySQL + API on your laptop (Lab 2)
src/setup-db.js      creates database, table and sample tasks (db:init and server startup)
src/startup.js       retry timing and config summary for the logs
test/                node:test unit + API tests
```
