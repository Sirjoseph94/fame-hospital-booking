# FAME Hospital Booking

Cross-platform hospital scheduling for **iOS, Android, and web**. The app is an **Expo SDK 58** (React Native 0.88) project with **Expo Router**, strict TypeScript, NativeWind v4, **Supabase Auth**, and **live Supabase-backed scheduling** (`lib/services/scheduling/` talks to Postgres via the anon client—not mock data).

Requires Node 22.13+, 24.3+ or 26+ (odd-numbered Node releases are not supported by SDK 58).

## What’s implemented

- Supabase sign-in and patient registration
- Persisted session (SecureStore on native, `localStorage` on web)
- Role-guarded route groups: Patient, Doctor, Admin
- Full booking flow: doctors, slots, holds, beneficiaries, appointments
- Doctor agenda/schedule, admin roster, capacity, and appointment views
- Enterprise scheduling schema: beneficiaries, slot holds, blackouts, hospital buffer settings

Pilot deployment steps, migration order, and smoke tests live in **[docs/RUNBOOK.md](docs/RUNBOOK.md)**. The phased rollout plan is in **[DEPLOYMENT_PLAN.md](DEPLOYMENT_PLAN.md)**.

## Prerequisites

- Node.js 18+ and npm
- A Supabase project (URL + anon key)
- SQL Editor access to run migrations in order (see RUNBOOK)

## Environment

Copy `.env.example` to `.env` and set:

```text
EXPO_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-public-key
EXPO_PUBLIC_SCHEDULING_LATENCY_MS=0
```

Restart the dev server after changing env vars. Never commit `.env`.

## Database setup

All schema lives in `supabase/migrations/` and runs in filename order. Either `supabase link --project-ref <ref> && supabase db push`, or paste each file into the SQL Editor in order. See [docs/RUNBOOK.md](docs/RUNBOOK.md) §2 (including §2a for databases created before the migration cleanup).

Test the chain locally with `bash supabase/tests/run.sh` (needs Docker).

Optional commented seed templates: `supabase/seed_pilot.sql`.

Transactional notifications (opt-in email, SMS, native push) require the Edge Function and webhook described in [docs/RUNBOOK.md](docs/RUNBOOK.md) §12.

**Roles:** Sign-up creates a **patient** profile. The first **admin** (and doctors until in-app invites ship in Phase 1) are promoted via Supabase—see RUNBOOK.

## Run locally

```bash
npm install
npm run web
```

Native:

```bash
npm run ios
npm run android
```

## Quality checks

```bash
npm run typecheck
npm run lint
```

## Web production export

```bash
npm run export:web
```

See [docs/RUNBOOK.md](docs/RUNBOOK.md) §10–11 for hosting, Supabase Auth URLs, and launch smoke tests.

## Project layout (high level)

| Path | Purpose |
|------|---------|
| `app/(auth)/` | Sign-in, sign-up |
| `app/(patient)/` | Home, book flow, visits, profile |
| `app/(doctor)/` | Agenda, schedule, blackout |
| `app/(admin)/` | Roster, appointments, capacity, doctor schedule |
| `lib/services/` | Supabase services (`auth`, `scheduling`, …) |
| `lib/supabase.ts` | Supabase client |
| `supabase/` | Schema, migrations, optional seed |

Product build sequence and decisions: `PLAN.md`.

## Deployment

CI (GitHub Actions) checks every PR. EAS Workflows (`.eas/workflows/`) handle PR previews, production OTA updates or builds, the website on Expo Hosting, and manual store submission. Builds read EAS environment variables, not `.env`. Setup and one-time steps: [docs/RUNBOOK.md](docs/RUNBOOK.md) §13.
