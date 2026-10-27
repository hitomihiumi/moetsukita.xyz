# moetsukita.xyz

Next.js 16 · Once UI 2 · next-intl · Auth.js · Drizzle + Postgres · S3 (R2). Deployed on Vercel.

## Develop

```bash
npm install
cp .env.example .env.local   # set AUTH_SECRET
docker compose up -d
npm run storage:setup && npm run db:migrate && npm run db:seed -- --demo
npm run dev
```

## Deploy (Vercel)

- Postgres (Neon, pooled URL) and two R2 buckets (private + public with a custom domain).
- Set the variables from `.env.example`; run `npm run storage:setup` once against R2.
- `vercel-build` applies migrations; `vercel.json` schedules the hourly tier sync (Pro plan).

## Scripts

`typecheck` · `lint` · `test` · `validate:ui` · `db:generate` · `db:migrate` · `db:seed` · `db:studio` · `storage:setup` · `storage:check` · `access:sync`
