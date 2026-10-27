# PapersBot

Online exams for University of Gujrat. Teachers build papers with MCQs and written questions, publish them to a class, and grade the results. Students attempt them in one go or section by section, with timers the server enforces. An admin approves teacher accounts.

Final Year Project by **Samran Taimoor** and **Arzoo Fatima**.

---

## What each panel does

**Admin**
- Approves or rejects teacher sign-ups (teachers can do nothing until approved)
- Searches all users, deactivates or reactivates accounts, resets passwords to a one-time temporary password
- Sees system totals: users, classes, exams, attempts in progress

**Teacher**
- Creates classes; students join with a 7-character code
- Builds exams with 1–4 sections (A–D), each with its own time limit; MCQ, short and long questions with per-question marks and marking guidelines
- Optional AI question generation from pasted notes or a text PDF (needs an OpenAI key)
- Sets the opening and closing time, attempts allowed, pass mark, whether students may go section by section, what happens when time runs out (hard lock or a grace period that's flagged as overtime), and question/option shuffling
- Results dashboard per exam: who attempted, in progress, within time / overtime / timed out, averages, integrity flags, CSV export, who hasn't attempted
- Grades written answers, with optional AI-suggested marks and feedback; grants extra attempts to individual students

**Student**
- Joins classes, sees only papers published to those classes
- Chooses **full paper** (one timer for everything) or **section by section** (one section at a time, each with its own timer, breaks allowed in between)
- Answers autosave as you type, and survive a refresh or a dropped connection
- Sees the score once grading is finished; correct MCQ answers appear only after the paper closes

## How timing works

The browser timer is only a display. The server decides.

- When a section starts, the server stores its deadline: start time + the section's minutes (full mode: + the whole paper's minutes), but never later than the paper's closing time.
- Every request that touches an attempt first checks the clock. A section whose deadline (plus any grace period) has passed is finalised with whatever answers were saved. So an abandoned attempt is closed the next time the student, or the teacher's dashboard, looks at it. No background job is needed.
- Answers sent after the deadline are rejected (hard lock) or accepted and flagged as overtime (grace period). A 10-second network allowance stops a submit pressed in the last second from being refused.
- In section-by-section mode, the time between sections doesn't count, but sections not started before the paper closes are lost.
- One student can have only one open attempt per exam (a database constraint), and can't exceed the attempt limit.

## Tech stack

| Part | Technology |
|---|---|
| Backend | Python 3.11+, Django 5.2, Django REST Framework |
| Database | PostgreSQL 14+ |
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, TanStack Query, Radix UI |
| Auth | Django sessions (HttpOnly cookie) + CSRF protection, hashed passwords |
| AI | OpenAI API (optional), `pypdf` for PDF text |
| Tests | pytest + pytest-django (backend), Playwright (end-to-end, run manually) |

## Folder layout

```
backend/
  config/        settings, URLs, error format
  accounts/      users, roles, login/register, admin panel API, seed_demo command
  classrooms/    classes and join codes
  exams/         exams, sections, questions, publishing, results dashboard
  attempts/      the attempt engine (services.py), answers, grading, integrity events
  ai/            question generation and grading suggestions
  tests/         pytest suite
frontend/
  src/pages/     admin/, teacher/, student/, auth/
  src/components ui primitives and the app shell
  src/lib        API client, types, formatting helpers
build.sh, start.sh   production build and start (Linux)
```

---

## Run it on Windows

You need **Python 3.11+** (tick "Add Python to PATH" when installing), **Node.js 20+** and **PostgreSQL 14+**.

### 1. Get the code onto your Desktop

```powershell
cd $HOME\Desktop
git clone https://github.com/samran178/<repo-name>.git PapersBot
cd PapersBot
```

### 2. Create the database

Open **SQL Shell (psql)** from the Start menu, log in as `postgres`, then run (use your own password):

```sql
CREATE USER papersbot WITH PASSWORD 'choose-a-password' CREATEDB;
CREATE DATABASE papersbot OWNER papersbot;
```

`CREATEDB` lets the test suite create its own throwaway test database.

### 3. Backend

```powershell
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements-dev.txt
copy .env.example .env
```

Open `backend\.env` and set `DATABASE_URL` to match step 2, for example
`postgresql://papersbot:choose-a-password@localhost:5432/papersbot`. Add `OPENAI_API_KEY` if you want the AI features.

```powershell
python manage.py migrate
python manage.py createsuperuser      # this account becomes the admin
python manage.py seed_demo            # optional: demo teacher, students and a sample exam
python manage.py runserver
```

Leave this terminal running. The API is now on http://127.0.0.1:8000.

### 4. Frontend (second terminal)

```powershell
cd $HOME\Desktop\PapersBot\frontend
npm install
npm run dev
```

Open **http://localhost:5173**.

If you ran `seed_demo`, every demo account uses the password `PapersBot@2026`:

| Username | Role |
|---|---|
| `admin` | Admin |
| `dr_sana` | Teacher (owns the sample class and exam) |
| `new_teacher` | Teacher waiting for approval |
| `ali`, `ayesha`, `hamza` | Students in the sample class |

### Running the tests

```powershell
cd backend
.venv\Scripts\activate
pytest
```

```powershell
cd frontend
npm run typecheck
```

---

## Deploying

Deploy to a Linux host (Render, Railway, a VPS). Django serves the API and the built React app from one port, so no separate frontend server is needed.

1. Create a PostgreSQL database and set these environment variables:

   | Variable | Value |
   |---|---|
   | `DEBUG` | `False` |
   | `SECRET_KEY` | a long random string: `python -c "import secrets; print(secrets.token_urlsafe(50))"` |
   | `DATABASE_URL` | your production database URL |
   | `ALLOWED_HOSTS` | `papersbot.com,www.papersbot.com` |
   | `CSRF_TRUSTED_ORIGINS` | `https://papersbot.com,https://www.papersbot.com` |
   | `OPENAI_API_KEY` | optional |
   | `SECURE_HSTS_SECONDS` | `31536000` once HTTPS is confirmed working |

2. Build command: `./build.sh`. Start command: `./start.sh`.
3. Create the admin once: `cd backend && python manage.py createsuperuser`.

The site must be served over **HTTPS** when `DEBUG=False`. Session and CSRF cookies are marked secure and plain HTTP requests are redirected. Never run `seed_demo` in production; it refuses to unless forced.

## API overview

All endpoints are under `/api/` and return JSON errors as `{"detail": "..."}`. Writes need the `X-CSRFToken` header (the frontend handles this).

| Area | Endpoints |
|---|---|
| Auth | `GET auth/csrf`, `POST auth/register`, `POST auth/login`, `POST auth/logout`, `GET/PATCH auth/me`, `POST auth/change-password` |
| Admin | `GET admin/stats`, `GET admin/users`, `POST admin/users/<id>/{approve,reject,activate,deactivate,reset-password}` |
| Classes | `GET/POST classes/`, `GET/PATCH/DELETE classes/<id>`, `POST classes/<id>/regenerate-code`, `GET classes/<id>/students`, `DELETE classes/<id>/students/<enrollment>`, `POST classes/join` |
| Exams (teacher) | `GET/POST exams/`, `GET/PATCH/DELETE exams/<id>`, `POST exams/<id>/{publish,unpublish,close,duplicate}`, `GET exams/<id>/results`, `POST exams/<id>/allowances` |
| Student | `GET student/exams`, `GET student/exams/<id>`, `POST student/exams/<id>/start` |
| Attempts | `GET attempts/<id>`, `POST attempts/<id>/{answers,submit,next-section,events}`, `POST attempts/<id>/grade`, `POST attempts/<id>/ai-suggest` |
| AI | `GET config`, `POST ai/generate-questions` |

## Known limitations

- **A browser can't prevent cheating.** Tab switches, copy, paste and leaving full screen are recorded and shown to the teacher, but a second phone or a printed book is invisible to any web app. Treat flags as evidence to look into, not proof.
- **AI output needs checking.** Generated questions and suggested marks are drafts; nothing AI-produced is saved or counted until the teacher accepts it. Student answers are passed to the model as data with clear instructions, but a teacher should still read any surprising AI mark.
- **PDFs must contain text.** Scanned pages need OCR first.
- **No email.** Password resets go through the admin, who hands out a temporary password.
- **No one-question-at-a-time mode.** Students see every question of the open section together.
