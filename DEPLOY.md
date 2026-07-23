# Deployment guide

## 1. Push to GitHub

The repo is already initialized with the remote pointing at `github.com/jisso-mc/microcharity`. Push it:

```bash
cd D:\Projects\microcharity
git push -u origin main
```

If GitHub asks for credentials, use a **Personal Access Token** (not your password):
https://github.com/settings/tokens → Generate new token (classic) → scope `repo` → copy → paste as the password.

If your repo on GitHub already has commits (e.g. an auto-generated README), force-push the first time:
```bash
git push -u origin main --force
```

## 2. Connect to Vercel

1. Go to https://vercel.com/new
2. **Import Git Repository** → pick `jisso-mc/microcharity`
3. Framework preset will auto-detect as **Next.js** — leave defaults
4. **Environment Variables** — paste each of the values below before clicking Deploy
5. Click **Deploy**. First build takes ~2 minutes.

## 3. Environment variables (paste into Vercel)

> **Do not commit real secret values to this file.** The canonical source of
> truth for production secrets is **Vercel → Project Settings → Environment
> Variables** (and `.env.local`, which is gitignored, for local dev). The
> placeholders below describe the shape of each value only.

Required:

| Name | Value |
|---|---|
| `DATABASE_URL` | `postgresql://<user>:<password>@<host>.ap-southeast-1.aws.neon.tech/<db>?sslmode=require&channel_binding=require` (from Neon dashboard) |
| `ADMIN_SESSION_SECRET` | random string, ≥32 chars (e.g. `openssl rand -base64 48`) |

Optional — fill in to enable the contact / refer-a-cause emails:

| Name | Value |
|---|---|
| `SMTP_HOST` | `smtp.gmail.com` |
| `SMTP_PORT` | `465` |
| `SMTP_USER` | `info@microcharity.com` (or whichever Gmail will be the sender) |
| `SMTP_PASS` | 16-char Gmail App Password — see https://myaccount.google.com/apppasswords |
| `SMTP_FROM` | `MicroCharity <info@microcharity.com>` |
| `ADMIN_INBOX` | `info@microcharity.com` |

Optional — fill in once Razorpay credentials arrive:

| Name | Value |
|---|---|
| `RAZORPAY_KEY_ID` | `rzp_test_…` or `rzp_live_…` |
| `RAZORPAY_KEY_SECRET` | (server-only, never commit) |
| `RAZORPAY_WEBHOOK_SECRET` | (set when registering the webhook in Razorpay dashboard) |
| `NEXT_PUBLIC_RAZORPAY_KEY_ID` | same as `RAZORPAY_KEY_ID` (this one is exposed to the browser, that's expected) |

## 4. First deploy → smoke test

Once Vercel finishes, you'll get a URL like `microcharity-xxxx.vercel.app`. Click around:

- [ ] Homepage loads with banner + impact card
- [ ] `/current-causes` lists active + past
- [ ] `/donations/<any-slug>` shows timeline
- [ ] `/legal-financial` PDFs download
- [ ] `/admin/login` — sign in with `nanzwilly@gmail.com` / your seeded password
- [ ] `/admin/causes` shows 123 rows
- [ ] `/admin/donations` shows empty state, "+ Add donation" works end-to-end

## 5. Custom domain

Once smoke-tested, in Vercel project settings → **Domains**:

1. Add `staging.microcharity.com` (or any subdomain you like)
2. Vercel will tell you to add a CNAME at your DNS host:
   - Type: `CNAME`
   - Name: `staging`
   - Value: `cname.vercel-dns.com`
3. Wait for DNS to propagate (5–30 min). SSL is auto-provisioned.

Test the staging domain end-to-end. Once happy, switch the apex `microcharity.com` and `www.microcharity.com` over by repeating the same steps with those names. Keep the WordPress site live as a fallback for at least a week.

## 6. Things that won't work in prod yet

- **Online donations** — needs Razorpay keys (above).
- **Donation receipt emails** — wired but template + PDF generation not yet built.
- **Contact / Refer-a-Cause emails** — work once SMTP creds are filled in.

## Notes for prod

- The Neon DB sits in `ap-southeast-1` (Singapore) — latency from Indian users is ~30ms.
- Vercel auto-deploys on every push to `main`. To deploy a feature without going live, push to a different branch — Vercel gives a preview URL.
