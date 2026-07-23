# CLAUDE.md — MicroCharity Website

Project context for Claude Code (and any human walking in cold). Read this
before making changes. Update it when conventions shift.

---

## What this is

The microcharity.com crowdfunding portal — a Next.js 15 (App Router) app
backed by Neon Postgres, deployed on Vercel. Donors give money to causes
(medical emergencies, school fees, etc.); admins manage causes, approve
donations, send announcement emails, and download 80G receipts.

Replaces a legacy WordPress site; all WordPress data was imported once at
the start (see `scripts/import-legacy.mjs`).

## Stack

- **Next.js 15** (App Router, RSC, server actions, Node runtime on Vercel)
- **TypeScript** (strict)
- **Tailwind CSS 4** (CSS-first theming via `@theme` in `app/globals.css`)
- **Prisma 6** ORM → Neon Postgres (`ap-southeast-1`)
- **Razorpay** for online card / UPI / net-banking payments
- **Vercel Blob** for image / PDF / attachment uploads
- **ExcelJS** for the donations export
- **pdf-lib** for 80G receipt generation
- **Nodemailer** via Gmail SMTP (App Password) for transactional + bulk email
- **Fraunces** (display) + **Manrope** (body) via Google Fonts

Schema-changes workflow uses **`prisma db push`** (no `migrations/` folder
exists). Edit `prisma/schema.prisma`, run `npm run db:push`, then
`npx prisma generate`.

---

## Local setup

```bash
git clone https://github.com/jisso-mc/microcharity.git
cd microcharity
npm install
cp .env.example .env.local   # then fill in secrets — see "Secrets" below
npm run dev                  # http://localhost:3000
```

The admin lives at `/admin/login`. To seed an admin user in a fresh DB, see
`scripts/seed-admins.mjs`.

### Useful npm scripts

```
npm run dev               # dev server
npm run build             # prisma generate + next build
npm start                 # production server (after build)
npm run db:push           # apply schema.prisma to the DB
npm run db:studio         # open Prisma Studio
npm run db:seed           # seed causes (legacy import; rarely needed now)
npm run db:seed-admins    # seed admin users
```

---

## Architecture map

```
app/
  layout.tsx                       root shell (Header + Footer)
  page.tsx                         home — reads from SiteStat singleton
  current-causes/                  public listing (renamed "Causes Supported")
  donations/[slug]/                public cause page
    DonateForm.tsx                 client form — Razorpay / UPI / Offline
    LivePoller.tsx                 refreshes raised total every 15s while visible
  success-stories/                 closed causes
  legal-financial/                 trust details + PDF audit reports
  refer-a-cause/, contact-us/      forms → Gmail SMTP
  unsubscribe/                     opt-out page (HMAC token in email links)

  admin/                           /admin route group, gated by getCurrentUser()
    layout.tsx                     top nav (Causes · Donations · Donors ·
                                   Announcements · Forms · Reports · Users)
    page.tsx                       dashboard (SiteStat editor + counts)
    login/                         email + password
    causes/                        list (3-dot menu per row), CauseStatusButton
      [slug]/                      detail — timeline, AddTimelineEntryForm,
                                   AnnouncementPanel
      new/                         CauseForm (supports ?from=<slug> duplicate)
      actions.ts                   server actions (create/update/delete/publish)
    donations/                     list + ExportPanel + ResendReceiptButton
    donors/                        list, soft-delete, status toggles
    announcements/                 global send list with open/click stats
    forms/                         contact / refer-a-cause submissions
    reports/                       counts dashboard
    users/                         invite + role management (ADMIN only)
    search/                        cross-entity search

  api/
    auth/login, auth/logout
    donate/online                  Razorpay order creation
    donate/qr, donate/offline      manual flows (admin approves)
    donate/verify                  Razorpay payment verification
    razorpay/webhook               Razorpay webhook
    cause-announcements/           POST creates a send, [id]/process pages a batch
    announcement/open/[id]         tracking pixel — sets openedAt
    announcement/click/[id]        click bouncer — sets firstClickedAt, 302s on
    admin/donations/export         streams .xlsx for the auditor
    unsubscribe                    1-click email opt-out (HMAC verified)
    contact, refer-cause           Gmail SMTP form submissions

lib/
  prisma.ts                        Prisma client singleton
  session.ts                       getCurrentUser() — reads JWT cookie
  auth.ts                          JWT helpers (jose), bcrypt
  crypto.ts                        AES-256-GCM for PAN encryption
  email.ts                         nodemailer + templates
  receipt.ts                       80G receipt PDF (pdf-lib, Noto Sans)
  donations.ts                     issueReceiptForDonation, approve flow
  announcements.ts                 batch sender, tracking-pixel injection
  uploads.ts                       @vercel/blob put()
  data/
    site.ts                        trust details, nav, social
    team.ts                        team bios for /who-we-are
    causes.ts                      loadGrouped() — beneficiary nesting,
                                   datePosted derived from latest caption
    stats.ts                       SiteStat singleton (manually edited totals)
  trust.ts                         PAN, CSR number, 80G order, signatory
  mcid.ts                          MCID-{seq}-{FY} generator (floors at 101)
  audit.ts                         audit-log insert (typed AuditAction enum)

prisma/schema.prisma               source of truth for DB shape
public/                            logo, signature, fonts, PDFs, etc.
scripts/                           seed + one-off migration scripts
legacy-astro/                      previous Astro build, kept for reference
                                   (safe to ignore / delete)
```

---

## Key concepts

### Causes and beneficiaries

A **Beneficiary** is a person/group (e.g. "Saniya"). Each round of
fund-raising for them is a separate **Cause** row. Causes share a
`beneficiaryKey` so the public site can nest them under one heading.

- `Cause.status`: `DRAFT`, `PUBLISHED`, `CLOSED`.
- `Cause.goalAmount === 0` triggers **informational-only** rendering — no
  donate widget, no progress bar (used for JCI Nalukody).
- Listing pages sort beneficiaries by the **latest** datePosted across
  their causes (see `lib/data/causes.ts` — `parseCaptionDate()`).
- "Duplicate" from the cause list creates a follow-up cause with all
  prior timeline entries pre-copied. "Add timeline entry" on the cause
  detail page appends a single entry without duplicating.

### MCID

Format `MCID-{seq}-{YY-YY}`, e.g. `MCID-107-25-26`. Generated in
`lib/mcid.ts`. **Sequence floors at 101** so a new FY opens at 101, not 1.
Shared between Cause.mcId and the originating CauseUpdate.mcId; collisions
are retried via `lib/retry.ts` (`retryOnUniqueViolation`).

### Donations

| Type | Flow |
|---|---|
| `ONLINE` | Razorpay checkout. Auto-APPROVED on signature verify. |
| `QR` | Donor scans UPI QR, submits UTR + (optional) screenshot. PENDING. |
| `OFFLINE` | Donor reports a bank transfer + reference. PENDING. |
| `MANUAL` | Admin enters a donation directly from /admin/donations/new. |

PENDING donations show in `/admin/donations` with Approve / Reject actions.
On approve, `issueReceiptForDonation()` generates the 80G PDF and emails it.

PAN is stored AES-256-GCM encrypted (`lib/crypto.ts`) and decrypted only at
receipt-generation and Excel-export time. **Address** is stored as a
snapshot per donation (`addressSnapshot`).

### Receipts

Generated as PDF via `lib/receipt.ts`. Receipt numbers reset each Indian
financial year: `2025-26/1`, `2025-26/2`, … (`nextReceiptNumber()`).

The 80G order number, trust PAN, CSR registration number, signatory, and
address all come from `lib/trust.ts` — edit there to update both the receipt
PDF and the Financials page in one shot.

### Announcements

`/admin/causes/[slug]` → "Launch announcement" panel. Has two distinct
sections (per Jisso's UX request):

- **Test announcement** — textarea of comma-separated emails (defaults to
  the logged-in admin's email). Sends a `[TEST]`-prefixed preview to
  exactly those addresses.
- **Send to all donors** — explicit accent button with the live count
  baked in. Sends to every `Donor` where `unsubscribed = false AND
  deletedAt IS NULL`.

Sending is batched: 50 recipients per minute, driven by the
`/api/cause-announcements/[id]/process` endpoint that the panel polls
every 60 seconds.

**Open and click tracking** is baked in. Every email contains a 1×1
pixel pointing at `/api/announcement/open/[recipientId]`, and every link
is rewritten through `/api/announcement/click/[recipientId]?to=…`. The
unsubscribe link is intentionally NOT routed through the click-tracker
(opt-outs shouldn't show up as engagement). Counts roll up to
`CauseAnnouncement.openCount` / `clickCount` and surface in
`/admin/announcements` and inline on the cause detail page.

### Site totals on the home page

The hero stats on `/` (and the Success Stories subtitle) read from the
`SiteStat` singleton (`lib/data/stats.ts`), **not** from live
`Donation` sums. Admins edit those numbers from the `/admin` dashboard;
legacy WordPress-era donations are baked into the manual figure.

### Soft delete vs hard delete

- **Donors**: soft delete (`deletedAt`). Excluded from admin list and from
  announcement recipient queries; donation history preserved.
- **Causes**: no UI for delete. Test-cause cleanups have been ad-hoc Node
  scripts (see commit history) — the 3-dot menu intentionally omits Delete.
- **Donations**: hard delete only via the ad-hoc cleanup scripts. Receipts
  cascade with their donations.

### Image storage

Featured cause images and donation attachments live on **Vercel Blob**
(`@vercel/blob`). Public URLs look like
`https://nfgjkqmir4qh3qbo.public.blob.vercel-storage.com/causes/<slug>/…`.
Renaming a blob uses `copy()` + `del()` (see the NusringStudent→NursingStudent
fix in git history).

---

## Conventions

- **Server actions** live in `actions.ts` next to the page they serve.
  Every mutation requires an admin session — wrap with `requireAdmin()`.
  Audit every state-changing action via `lib/audit.ts` (extend the
  `AuditAction` union when adding a new one).
- **Revalidate** the affected public path after a mutation
  (`revalidatePath("/")`, `revalidatePath("/donations/[slug]")`, etc.).
- **Client buttons** that fire fetch / form actions should always show
  busy state: spinner + label change + `disabled={pending}` (see
  `app/admin/causes/CauseStatusButton.tsx` as the canonical pattern).
- **Caption-date parsing**: timeline-entry captions follow
  `"Mon D, YYYY - Title (MCID-…)"` or `"D-Mon-YYYY - …"`. `lib/data/causes.ts`
  parses both forms; keep the format consistent when adding new entries.
- **Brand name**: `MicroCharity` (capital C). Never `Microcharity`.
- **Inline links** in cause summaries / timeline bodies use
  `[label](https://url)` Markdown-style syntax and always open in a new tab
  (rendered in `app/donations/[slug]/page.tsx` → `renderParagraph()`).

---

## Secrets

`.env.local` is gitignored. Required vars (see `.env.example`):

```
DATABASE_URL                   Neon Postgres connection string
ADMIN_SESSION_SECRET           ≥32 chars; signs JWT cookies + HMACs unsub tokens
PII_ENC_KEY                    64 hex chars; AES-256 key for PAN at rest

RAZORPAY_KEY_ID                rzp_live_… (or rzp_test_… for testing)
RAZORPAY_KEY_SECRET            server-only
RAZORPAY_WEBHOOK_SECRET        set when configuring the Razorpay webhook
NEXT_PUBLIC_RAZORPAY_KEY_ID    same as RAZORPAY_KEY_ID (browser-exposed; expected)

SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER                      info@microcharity.com (Gmail)
SMTP_PASS                      16-char Gmail App Password
SMTP_FROM                      "MicroCharity <info@microcharity.com>"
ADMIN_INBOX                    info@microcharity.com

BLOB_READ_WRITE_TOKEN          Vercel Blob R/W token (from Vercel dashboard)
```

Production values live in **Vercel → Project Settings → Environment
Variables**. `.env.local` is for local dev only.

**Rotate `ADMIN_SESSION_SECRET` and `PII_ENC_KEY` only if absolutely
necessary** — rotating the session secret signs out every admin, and
rotating the encryption key makes every stored PAN unreadable.

---

## Common tasks

- **Add a timeline entry to a published cause** — `/admin/causes/[slug]` →
  "Add a timeline entry" panel.
- **Edit donor list (active/subscribed/delete)** — `/admin/donors`.
- **Send announcement** — open the cause's admin page → use Test
  Announcement first, then "Send to all donors".
- **Download donation export** — `/admin/donations` → date range + Download
  Excel.
- **Edit trust details on receipts** — `lib/trust.ts`.
- **Edit site totals on home page** — `/admin` dashboard.
- **Add a new admin user** — `/admin/users` (ADMIN role only). Sends an
  invite email.
- **Database changes** — edit `prisma/schema.prisma`, then
  `npm run db:push && npx prisma generate`.
