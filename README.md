# FAME Hospital Booking

Cross-platform hospital scheduling for **iOS, Android, and web**. The app is an **Expo SDK 58** (React Native 0.88) project with **Expo Router**, strict TypeScript, NativeWind v4, **Supabase Auth**, and **live Supabase-backed scheduling** (`lib/services/scheduling/` talks to Postgres via the anon client—not mock data).

Requires Node 22.13+, 24.3+ or 26+ (odd-numbered Node releases are not supported by SDK 58).

## What’s implemented

- Supabase sign-in and patient registration
- Persisted session (SecureStore on native, `localStorage` on web)
- Role-guarded route groups: Patient, Doctor, Admin
- Clinic sessions, first come, first served: doctors (or admins) create sessions with a patient limit, one-off or weekly; patients book a place instantly, for themselves or a family member, and can change session or cancel
- Doctors: session agenda with an expandable patient summary; sessions with room and patient limit (editable); cancel with a reason patients see
- Patients: doctor bios, edit/remove family members, recent updates (messages sent), account deletion
- Admins: book/cancel/move on a patient's behalf, patient directory, doctor details and department, invite history, activity log, failed-message retry, hospital time zone
- Doctor agenda/schedule, admin roster, capacity, and appointment views
- Scheduling schema: `clinic_sessions`, capacity-checked booking RPCs, beneficiaries (the original slot/hold/blackout tables were removed in migration 22)

Pilot deployment steps, migration order, and smoke tests live in **[docs/RUNBOOK.md](docs/RUNBOOK.md)**. The original rollout plan, [DEPLOYMENT_PLAN.md](DEPLOYMENT_PLAN.md), is kept for history (it predates clinic sessions).

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
| `app/(doctor)/` | Agenda (sessions and their bookings), schedule (create/cancel sessions), profile |
| `app/(admin)/` | Roster, appointments, capacity, doctor schedule |
| `lib/services/` | Supabase services (`auth`, `scheduling`, …) |
| `lib/supabase.ts` | Supabase client |
| `supabase/` | Schema, migrations, optional seed |

Original product build sequence (historical, pre-sessions): `PLAN.md`.

## Deployment

CI (GitHub Actions) checks every PR. EAS Workflows (`.eas/workflows/`) handle PR previews, production OTA updates or builds, the website on Expo Hosting, and manual store submission. Builds read EAS environment variables, not `.env`. Setup and one-time steps: [docs/RUNBOOK.md](docs/RUNBOOK.md) §13.
