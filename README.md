# Wisesplit

**Split expenses, not friendships.**

Wisesplit tracks who paid for what on a shared trip, and works out the smallest set of
payments that settles everyone up. No accounts, no passwords, nothing to install — one
person creates a group, everyone else joins through a link.

---

## Using it

### Start a group
Open the site and enter a **group name** and **your name**. That's the whole signup. You
land in the group dashboard, signed in as yourself.

### Invite everyone else
Go to **Settings** and copy the invite link, or send each person their own personal link
from the same page. Anyone who opens the group link and types their name is in.

### Logging in

**There are no passwords and no accounts.** Your identity is a cookie set by your personal
link, so "logging in" means opening a link:

| Situation | What to do |
|---|---|
| **First time** | Open the group's join link, type your name |
| **Coming back** | Open **your personal link** — `/g/<group>/u/<token>` |
| **New phone, or browser data cleared** | Same — your personal link |
| **Shared device, different person** | Open *their* link, or use **Switch member** in the menu |

**Treat your personal link as your password.** Anyone holding it *is* you. Send it
privately, and keep it somewhere you'll find it again — there is no "forgot password" to
fall back on.

One quirk to know about: if someone types a name that already exists in that group, the
join page signs them in **as that existing person** rather than creating a second one.
That's deliberate — it's how you get back in if you lose your link and remember your name.

### Day to day
- **Add expense** — who paid, how much, split equally, by exact amounts, or by percentage
- **Balances** — who is owed what
- **Settle up** — the minimum set of transfers that clears every debt; record a payment
  and the balances update
- **Settings** — invite links, members, categories

---

## Technical

**Stack** — Next.js 16 (App Router) · Prisma 6 · MariaDB · Tailwind v4. Single tier: server
actions and route components only, no separate API layer.

### Running locally

```bash
npm install
cp .env.example .env                            # secrets only
cp config/deploy.example.yml config/deploy.yml  # the file you edit
mariadb -u root wisesplit_dev < tables.sql      # once per database
npm run dev
```

### Things that will bite you

**Run `npm run typecheck && npm run build` before every release.** `next dev` compiles
lazily and **does not fail on TypeScript errors** — in one QA round the app served every
page correctly while `next build` could not produce an artifact at all. A green dev server
is not evidence that the app builds. CI enforces this on every push
(`.github/workflows/build-gate.yml`).

**Use `npm run dev`, not `npm run dev:turbo`.** Bare `next dev` (Turbopack) is unusable on
this machine: it leaked 722 worker processes in about 90 seconds, and every request then
returned `500`. It looks exactly like a broken app. It isn't — switch and re-run.

**`config/deploy.yml` is the one file you edit** (gitignored; copy the template). It holds
profiles `dev` / `test` / `prod`, and `lib/config/deploy.ts` projects the active profile
into `process.env.DATABASE_URL` at startup. That's why `DATABASE_URL` is deliberately
**not** in `.env` — the loader warns if it finds one. Precedence:
`DEPLOY_PROFILE` > `profile:` in the file > `NODE_ENV`.

**Money is `DECIMAL(12,2)`, and Prisma returns it as `Decimal` objects, not numbers.** All
arithmetic goes through `lib/money.ts`; rounding is half-up on the decimal, which is why
10% of $10.05 is $1.01 rather than $1.00. Shares always sum to the expense total exactly.

**Auth is cookie-based with no sessions.** Each member has a token; `/g/<slug>/u/<token>`
sets an httpOnly cookie `wisesplit_<token>` scoped to `/g/<slug>`. Every server action
re-checks the cookie itself — **the `(auth)` layout does not protect server actions.**

### Deploying

Vercel, from the CLI — `npx vercel --prod`. No Git integration required, and the same
command updates the same project and URL.

- **`DATABASE_URL`** goes in the Vercel project as an environment variable, with
  `?connection_limit=1&sslaccept=accept`.
- **Set the function region to match the database's region** (Settings → Functions).
  Otherwise every query crosses an ocean.
- **`.vercelignore` is load-bearing.** The Vercel CLI does **not** read `.gitignore`, so
  without it `.env` and `config/deploy.yml` would be uploaded with the deployment. The
  config file would also be read at build time and *override* the Vercel `DATABASE_URL`
  with the `dev` profile — a silent, confusing wrong-database deploy.
