# Changelog

## 1.1.0 — 2026-10-14

Multi-currency, and identity fixed at entry.

### Features
- Each group enables its own currencies (SGD by default). Every expense and settlement
  carries a currency, and balances, the settle-up plan and the dashboard are computed
  **per currency** — never blended across them
- Identity is fixed when you enter. The join page lists the group's members and lets you
  pick your name; it cannot create new members, and you cannot switch from inside the app

### Breaking
- `Expense` and `Settlement` gain a **required** `currencyId`, so existing rows cannot be
  migrated. The upgrade recreates the tables and **discards all data** —
  `prisma/production-recreate-tables.sql`

### Known limitations
Unchanged from 1.0.0: knowing a group's slug is enough to mint a session for it, and
deleting an expense or category does not verify it belongs to the group being viewed.

## 1.0.0 — 2026-10-05

First release. Deployed on Vercel against a managed MariaDB.

### Features
- Create a group and invite people by link — no accounts, no passwords
- Record expenses split equally, by exact amount, or by percentage
- Per-member balances, and a simplified settle-up plan showing the minimum transfers
- Record settlements and watch the balances clear
- Per-group categories with emoji, editable

### Correctness
- Money is exact `DECIMAL(12,2)` on MariaDB, rounded half-up — no binary floating point
- Shares always sum to the expense total; an unequal split that doesn't land exactly on
  the total is **refused**, not silently normalised
- Settlement direction is verified: clearing a debt lowers the creditor and raises the debtor

### Security
- Member identity is an httpOnly cookie scoped to `/g/<slug>`, re-checked by every server
  action (the `(auth)` layout does not protect server actions)
- Database connections use TLS in transit (`sslaccept=accept`)

### Known limitations
Deliberately deferred rather than fixed — acceptable among a group of friends who trust
each other, but not safe for a public deployment:
- Knowing a group's slug is enough to mint a session for it
- Deleting an expense or category does not verify that it belongs to the group being viewed
