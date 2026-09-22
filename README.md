# HabitLab

**Build better habits. Break bad ones. Understand what helps you change.**

HabitLab is a student-focused behavior-change app for the Congressional App Challenge. It diagnoses a habit loop, creates a four-rule plan, tracks experiments, and uses your results to recommend strategies. The behavior engine works without an AI account or API key.

## What is included

- Build/break questionnaire: cue, behavior, reward, obstacles, and a tiny first step.
- Personal plans based on the four behavior-change rules.
- Five-minute focus timer and daily check-ins.
- Coach with deterministic recommendations and optional AI personalization.
- Insights by day, time, strategy, and trigger, with minimum sample sizes.
- Calendar, XP, and recovery rewards.
- Email-code account flow using Supabase Auth; private records in Cloudflare D1.
- A clearly labeled demo workspace with synthetic data.

**Current status:** the working prototype and email-auth integration are included. Real email sign-in requires a configured Supabase project and email delivery. AI personalization requires an API key. Neither is necessary to explore the demo.

## Run locally

Use Node.js 24 and pnpm **11.25.0**, matching `package.json`. Keep the existing pnpm lockfile.

```sh
pnpm install --frozen-lockfile
pnpm setup
pnpm dev
```

Open **http://localhost:5173**. Setup creates local environment settings and applies the database migrations to local storage only. It preserves any environment settings already present. No Cloudflare account is needed for the local database.

To test saving without connecting Supabase, set `TRUST_SITES_AUTH=true` in your local `.dev.vars`, restart the development server, then open `http://localhost:5173/signin-with-chatgpt?return_to=/`. On localhost, the development plugin supplies a fixed test user; this does not sign you in to ChatGPT. Set the flag back to `false` for any independent hosted deployment. Local mock sign-in is for development only.

For real email accounts, keep `TRUST_SITES_AUTH=false` and follow [authentication setup](docs/authentication.md).

## Commands

| Command | Purpose |
| --- | --- |
| `pnpm setup` | Create local settings and initialize the local database |
| `pnpm dev` | Start development server on port 5173 |
| `pnpm db:migrate:local` | Apply new migrations to local storage |
| `pnpm typecheck` | Check TypeScript |
| `pnpm lint` | Lint project code |
| `pnpm build` | Build the Worker and browser assets |
| `pnpm test:engine` | Check strategy, analytics, XP, and coaching behavior |
| `pnpm test:auth` | Test the built Worker with isolated D1 and fake identity responses |
| `pnpm check` | Run types, lint, build, and both test suites |

The authentication suite requires a completed production build. It sends no emails and needs no service credentials. GitHub Actions runs the checks on pushes and pull requests; it does not deploy the app.

## How the app works

`lib/habits.ts` contains the behavior engine. The questionnaire feeds a rule-based plan, a tiny-step selector, and strategy ranking. Strategies become eligible after three attempts and use add-one smoothing: `(successes + 1) / (attempts + 2)`. Phone-location comparisons require five observations in each group. Unlogged days are excluded from success rates. Observations are associations, not proof that a strategy caused improvement.

The server checks identity and record ownership for every protected action. Check-ins are unique per account, habit, and date, so editing an entry does not duplicate its XP. Real account data stays in D1. The demo stays in browser memory and resets on reload.

| Location | Responsibility |
| --- | --- |
| `app/habit-lab.tsx` | Dashboard, questionnaire, tracker, coach, and timer |
| `app/account-dialog.tsx` | Email-code sign-in interface |
| `app/api/` | Authenticated server endpoints |
| `lib/habits.ts` | Habit plans, analytics, coach rules, and XP |
| `lib/auth.ts` | Verified identity and cookie sessions |
| `db/` and `drizzle/` | Database schema and migrations |
| `tests/` | Behavior and account-isolation checks |

The optional OpenAI call personalizes a recommendation already produced by the engine. When unavailable, the deterministic coach remains active. API keys stay on the server.

## Deployment and project limits

This project uses React, TypeScript, Vinext/Vite, and a Cloudflare Worker with D1. It requires a server and database; GitHub Pages cannot run its authentication or API routes. The existing Sites hosting configuration is retained for the original HabitLab deployment. Publishing source to GitHub does not deploy it or move its database.

For another host, configure a real D1 binding, apply migrations, provide the exact HTTPS `APP_ORIGIN`, and activate Supabase email sign-in. Leave `TRUST_SITES_AUTH=false`; an independent host must not trust Sites identity headers supplied by visitors. See [authentication setup](docs/authentication.md) for the transition from existing accounts.

Timers reset on page reload. The prototype has no notification scheduling, account-deletion UI, or habit-editing UI. Personal data and secrets are excluded from Git. Dependency licenses included under `build/` and `vendor/` remain in place. The four-rule framework is inspired by James Clear's *Atomic Habits*; the app's implementation and data analysis are its own.
