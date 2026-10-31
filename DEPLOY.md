# ClassBridge — Put it on a real website

ClassBridge is a standard Next.js app with a Postgres database. To use it as a
public website you need two things:

1. **Hosting for the app** (recommended: Vercel — free, HTTPS included)
2. **A hosted Postgres database** (recommended: Neon — free tier is plenty)

No API keys are needed. The only environment variable the app requires is
`DATABASE_URL`. **Database tables are created automatically** on the first
request — you never run migrations by hand.

---

## Option A: Vercel + Neon (recommended, ~10 minutes, free)

### 1. Get the code onto GitHub

- Create a new repository at https://github.com/new (name it e.g. `classbridge`).
- Push this project folder to it, or drag the files into the repo via
  GitHub's "upload files" screen. Don't upload the `node_modules` folder.

### 2. Create the database (Neon)

1. Sign up at https://neon.tech (free tier) and create a new project.
2. Open the project → **Connect** → copy the **connection string**
   (looks like `postgresql://user:pass@ep-xxx.neon.tech/dbname?sslmode=require`).
3. That's it — the app creates its own tables on startup.
   (If you ever change the schema in code, you can still run
   `npx drizzle-kit push` against it.)

### 3. Deploy the app (Vercel)

1. Sign up at https://vercel.com ("Continue with GitHub").
2. Click **Add New → Project** and pick your `classbridge` repository.
3. Under **Environment Variables**, add:
   - Key: `DATABASE_URL`
   - Value: the Neon connection string from step 2.
4. Click **Deploy**. After about a minute you get a public URL like
   `https://classbridge.vercel.app` — open it on any device.
5. Optional: **Settings → Domains** to attach your own domain.

### 4. Try it

Open the URL on two devices, create a room on one, join with the code on the
other. Done.

---

## Option B: Railway or Render (app + database in one place)

1. Push this project to GitHub (same as above).
2. Create a project from the repo and add a **Postgres** plugin/service.
3. Set the app's `DATABASE_URL` environment variable to the provided
   connection string.
4. Deploy. Tables appear automatically on the first request.

---

## Important notes

- **HTTPS is required for the microphone.** Vercel, Railway and Render all
  give you HTTPS automatically — never run this over plain `http://`.
- **Use Chrome or Edge** for speaking. All browsers can join, read, and type.
- **Free-tier limits:** translation uses free public endpoints; very heavy
  use may occasionally fall back to showing the original text. For a
  classroom, tour group or event this is fine. To upgrade later, swap the
  engine in `src/lib/translate-server.ts` (DeepL, Google Cloud Translation,
  Azure Translator) — nothing else changes.
- **Rooms persist** in Postgres, so room codes survive redeploys as long as
  you keep the same database.
- **Cost:** Vercel Hobby + Neon free tier = $0 for typical use.

## Local development refresher

```bash
npm install
npm run dev        # app on http://localhost:3000
npx drizzle-kit push   # optional — tables also auto-create via /api/health
```
