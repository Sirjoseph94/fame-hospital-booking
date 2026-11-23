# Web pilot runbook

Use this guide to stand up a **fresh Supabase project** and complete **one patient booking on web** without guessing migration order or bootstrap steps.

**Target:** operators and engineers deploying the pilot described in [DEPLOYMENT_PLAN.md](../DEPLOYMENT_PLAN.md) Phase 0–6.

---

## 1. Create the Supabase project

1. Create a project in the [Supabase dashboard](https://supabase.com/dashboard).
2. Note **Project URL** and **anon public** key (Settings → API).
3. In the app repo, copy `.env.example` → `.env` and set:
   - `EXPO_PUBLIC_SUPABASE_URL`
   - `EXPO_PUBLIC_SUPABASE_ANON_KEY`
4. For local web dev, under **Authentication → URL configuration**, set **Site URL** to `http://localhost:8081` (or your Expo web port). Under **Redirect URLs**, add:
   - `http://localhost:8081/**` (or your dev origin with wildcard)
   - Production: `https://<your-host>/reset-password` (password reset from sign-in → **Forgot password?**)

---

## 2. Migration checklist (run in order)

Run each file as a **New query** in **SQL Editor**, top to bottom. Wait for success before the next file.

| Step | File | Notes |
|------|------|--------|
| 1 | [`supabase/schema.sql`](../supabase/schema.sql) | Core tables, RLS, `doctor_invites`, `claim_doctor_invite` RPC |
| 2 | [`supabase/migrations/20260318_enterprise_scheduling.sql`](../supabase/migrations/20260318_enterprise_scheduling.sql) | Beneficiaries, holds, blackouts, appointment extensions, booking slot UPDATE policy |
| 3 | [`supabase/migrations/20260319_doctor_appointment_context.sql`](../supabase/migrations/20260319_doctor_appointment_context.sql) | Doctor read access to holder profiles and beneficiaries |
| 4 | [`supabase/migrations/20260320_profile_extensions.sql`](../supabase/migrations/20260320_profile_extensions.sql) | Optional profile medical/contact fields |
| 5 *(optional)* | [`supabase/migrations/004_avatars_bucket.sql`](../supabase/migrations/004_avatars_bucket.sql) | Storage bucket for avatars; **not required** for pilot (upload UI deferred) |
| 6 | [`supabase/migrations/20260918_invites_and_account_management.sql`](../supabase/migrations/20260918_invites_and_account_management.sql) | **`is_active` on profiles** — run this even if step 1 included invites |
| 7 | [`supabase/migrations/20260918_blackout_delete_policy.sql`](../supabase/migrations/20260918_blackout_delete_policy.sql) | Doctor **delete** on own `blackout_rules` (Phase 5) |
| 8 | [`supabase/migrations/20260919_phase7_slot_security.sql`](../supabase/migrations/20260919_phase7_slot_security.sql) | **Phase 7:** slot hold/book RPCs, drop broad slot UPDATE policy, `admin_audit_log` |
| 9 | [`supabase/migrations/20260920_notifications.sql`](../supabase/migrations/20260920_notifications.sql) | Notification preferences, push tokens, delivery outbox, appointment triggers |
| 10 | [`supabase/migrations/20260921000000_security_hardening.sql`](../supabase/migrations/20260921000000_security_hardening.sql) | **Required.** Role-escalation fixes, transactional booking RPCs, appointment write lockdown, invite/claim hardening, function privileges, indexes. See §7a. |

### Skip duplicate `doctor_invites`

If step 1 already created `doctor_invites`, policies, and `claim_doctor_invite`, **do not re-run** the duplicate `CREATE TABLE` / policy blocks from step 6. For a greenfield install from `schema.sql` only, step 6 still adds `is_active` safely via `add column if not exists`; if policies already exist, ignore “already exists” errors on duplicate policy names or run only the `is_active` alter from that file.

**Verify after migrations:**

```sql
select table_name from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'profiles', 'doctors', 'appointment_slots', 'appointments',
    'beneficiaries', 'slot_holds', 'doctor_invites', 'hospital_settings',
    'notification_preferences', 'push_device_tokens', 'notification_deliveries',
    'blackout_rules', 'admin_audit_log'
  )
order by 1;
```

You should see all listed tables.

---

## 3. Create the first admin

Every sign-up gets `role = 'patient'` from the auth trigger. Sign-up metadata **cannot** set a role, and users cannot change their own `role` / `is_active` (enforced by a trigger after step 10). Promote the first admin manually:

**Option A — Dashboard**

1. Sign up once in the app (or create a user under **Authentication → Users**).
2. Open **Table Editor → `profiles`**, find that user’s row, set **`role`** to `admin`.
3. Ensure **`is_active`** is `true`.

**Option B — SQL** (replace UUID after you know the user id from **Authentication → Users**):

```sql
update public.profiles
set role = 'admin', is_active = true
where id = '00000000-0000-0000-0000-000000000000';
```

Sign out and sign in again so the app reloads the profile role.

---

## 4. Doctor bootstrap (until Phase 1 in-app invites)

Phase 1 adds **Admin → Invite doctor** and **Claim invite code** in the app. Until then, use one of these:

### 4a. Manual doctor (SQL + app sign-in)

1. Create a doctor user (sign-up in app or **Authentication → Users → Add user**).
2. Promote profile and insert `doctors` (replace UUID and specialty):

```sql
update public.profiles
set role = 'doctor', is_active = true
where id = 'DOCTOR_USER_UUID';

insert into public.doctors (id, specialty, bio, consultation_fee, years_experience, is_active)
values ('DOCTOR_USER_UUID', 'General Practice', 'Pilot doctor', 0, 5, true)
on conflict (id) do nothing;
```

3. Sign in as that user and open **Schedule** to generate slots, **or** use commented templates in [`supabase/seed_pilot.sql`](../supabase/seed_pilot.sql) to insert `appointment_slots` manually.

### 4b. Invite row + RPC (database only)

Admins create invites from the Roster screen and share the code. After step 10 the code can only be claimed by a signed-in user **whose email matches the invite email** (case-insensitive), and invite rows are no longer readable by non-admins. The **`claim_doctor_invite`** RPC exists in the database, but **the patient/doctor claim UI ships in Phase 1**. For pilot testing without Phase 1, prefer **4a** or have the doctor user call the RPC from a one-off client session once claim UI exists.

---

## 5. Start the app

```bash
npm install
npm run web
```

Confirm `.env` points at the same Supabase project you migrated.

---

## 6. Patient smoke test (Phase 0 acceptance)

Goal: **one successful booking** end-to-end on web (appointment may stay **pending** until a doctor confirms—that is expected).

| # | Action | Expected |
|---|--------|----------|
| 1 | Sign up as a new patient | Lands on patient Home; profile role `patient` |
| 2 | Complete profile / self beneficiary if prompted | Booking can select “self” beneficiary |
| 3 | **Book Appointment** → pick doctor → pick slot | Hold countdown (~5 minutes); slot moves to held |
| 4 | Intake → confirm | Success state; no hard error |
| 5 | **My Visits** | New appointment visible (typically **pending**) |
| 6 | *(Optional)* Sign in as doctor with slots on that day | Appointment appears on **Agenda** |

If no doctors or slots appear, finish [§4 Doctor bootstrap](#4-doctor-bootstrap-until-phase-1-in-app-invites) and ensure `doctors.is_accepting_bookings = true` and slots are **`available`** with future date/time.

---

## 7. Security notes (I-21, I-22) — Phase 7

After migration **step 8** (`20260919_phase7_slot_security.sql`), patient slot transitions use **SECURITY DEFINER RPCs** instead of a broad UPDATE policy:

| RPC | Purpose |
|-----|---------|
| `hold_slot_if_available` | Atomic hold when slot is `available` or already held by caller |
| `release_slot_hold` | Caller releases their hold |
| `book_held_slot` | Caller’s valid hold → `booked` |
| `free_orphan_booked_slot` | `booked` → `available` when no pending/confirmed appointment references the slot (cancel / reschedule) |
| `cleanup_expired_slot_holds` | Expired holds + `held` → `available` (called by `hold_slot_if_available`; scheduled every minute by pg_cron after step 10 if the extension is enabled) |

The policy **“Authenticated users update slots for booking”** is **dropped**. Doctors and admins still manage slots via existing doctor/admin RLS policies (schedule, blackouts).

**Admin audit:** table `admin_audit_log` (admins read-only via RLS) records `doctor_invite_created`, `doctor_invite_revoked`, `profile_deactivated`, and `profile_reactivated` via triggers.

**Deploy note:** Apply step 8 **before** shipping a client build that calls these RPCs. Older app versions against a DB without step 8 still rely on the broad UPDATE policy (step 2 only).

**Pre–Phase 7 pilots (step 8 not applied):** holds were client-side upserts with a race (I-21) and any authenticated user could UPDATE slots (I-22). Do not run a Phase 7 client against that schema.

### 7a. Security hardening (step 10)

`20260921000000_security_hardening.sql` must be applied **before** shipping a client build that includes the transactional booking changes — the client calls the new RPCs below, and the migration removes patients' direct INSERT/UPDATE on `appointments`, so **older clients can no longer book, reschedule or cancel** once it is applied. Deploy DB + client together.

| RPC | Purpose |
|-----|---------|
| `book_appointment_from_hold` | Validates hold, slot, doctor availability and beneficiary; inserts the appointment, books the slot, clears the hold — one transaction |
| `reschedule_appointment` | Moves an appointment to a slot the caller holds (same doctor), books it, frees the old slot — one transaction |
| `cancel_appointment` | Cancels and frees the slot — one transaction |

Other changes:

- `appointments_one_active_per_slot` — partial unique index; the migration aborts with instructions if duplicates exist.
- Doctors may still update their own appointments directly, but only `status` (pending→confirmed/cancelled, confirmed→completed/cancelled), `room`, `video_url` and `notes`. `video_url` must be `https://`.
- Taking a new slot hold releases the caller's other holds (one active hold per user). Holds are visible only to their owner.
- Internal SECURITY DEFINER helpers (`enqueue_notification_deliveries`, `log_admin_audit`, trigger functions) are no longer executable by `anon`/`authenticated`.
- `free_orphan_booked_slot` is restricted to the slot's doctor or an admin.
- **pg_cron (recommended):** enable it under Database → Extensions, then re-run the migration to schedule the expired-hold sweep.

---

## 8. Optional seed file

[`supabase/seed_pilot.sql`](../supabase/seed_pilot.sql) contains **commented templates only** (admin note, doctor row, sample slots). It is not run automatically by the app. Uncomment and edit UUIDs/dates when you want copy-paste examples.

---

## 9. Troubleshooting

| Symptom | Check |
|---------|--------|
| “Invalid API key” / network errors | `.env` URL and anon key; restart dev server |
| Login works but wrong screens | `profiles.role`; sign out/in; `is_active = true` |
| No doctors in picker | `doctors` row exists, `is_active`, `is_accepting_bookings` |
| No slots | Doctor **Schedule** tab or seed templates; slot `status = 'available'`, future date |
| RLS errors in console | Migrations 1–4 applied; user authenticated |
| Duplicate policy errors on step 6 | Expected if `schema.sql` already created invites; run only missing pieces |

---

## 10. Web export (Phase 6)

Production static bundle for any static host (Netlify, Vercel, S3, etc.):

```bash
npm install
# Set EXPO_PUBLIC_* in .env or CI secrets (prod Supabase URL + anon key)
npm run export:web
```

Output directory: **`dist/`** (default Expo web export). Serve `dist` as static files; configure your host so client routes fall back to `index.html` (SPA).

Optional tuning:

- `EXPO_PUBLIC_SCHEDULING_LATENCY_MS=0` for production (see `.env.example`).

### Supabase Auth for production web

In **Authentication → URL configuration**:

- **Site URL:** `https://<your-host>`
- **Redirect URLs:** `https://<your-host>/**` and `https://<your-host>/reset-password`

Match email templates and confirm links to the same host.

---

## 11. Launch smoke matrix (Phase 6)

Run on the **production** web URL after export/deploy:

| Area | Check |
|------|--------|
| Ops | Migrations through step 8 applied (Phase 7 RPCs for production traffic) |
| Onboarding | Admin invite → doctor claim → Schedule slots |
| Patient book | Stepper + hold banner; grouped slots; confirm shows beneficiary |
| Pending flow | Doctor agenda pending badge → confirm (room / video URL) |
| Lifecycle | Mark complete → patient Past |
| Account | Forgot password; admin deactivate |
| UX spot-check | Add dependent “Book now” vs “Add only”; remove future blackout |
| Quality | `npm run typecheck` and `npm run lint` clean; `npm run export:web` succeeds |
| Notifications | Opt-in on Profile → book / confirm / cancel → rows in `notification_deliveries` (`sent` or `skipped`) |

---

## 12. Notifications (email, SMS, push)

After migration **step 9**, deploy the Edge Function and wire delivery.

### Deploy Edge Function

From the repo root (Supabase CLI logged in to the project):

```bash
supabase functions deploy dispatch-notifications --no-verify-jwt
```

`--no-verify-jwt` allows the **Database Webhook** to POST without a user JWT. The function therefore requires a shared secret in the `x-webhook-secret` header and **rejects every request (fails closed) until `NOTIFICATION_WEBHOOK_SECRET` is set**.

Generate one with `openssl rand -hex 32`.

Set secrets (Dashboard → Edge Functions → Secrets, or CLI):

| Secret | Purpose |
|--------|---------|
| `NOTIFICATION_WEBHOOK_SECRET` | **Required.** Shared secret the Database Webhook sends as `x-webhook-secret` |
| `RESEND_API_KEY` | [Resend](https://resend.com) transactional email |
| `NOTIFICATION_FROM_EMAIL` | Verified sender, e.g. `FAME Hospital <booking@yourdomain.com>` |
| `TWILIO_ACCOUNT_SID` | Twilio SMS |
| `TWILIO_AUTH_TOKEN` | Twilio SMS |
| `TWILIO_FROM_NUMBER` | E.164 sender, e.g. `+15551234567` |

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically for Edge Functions.

### Database Webhook

In **Supabase Dashboard → Database → Webhooks → Create**:

1. **Table:** `public.notification_deliveries`
2. **Events:** `INSERT`
3. **Type:** Supabase Edge Function → `dispatch-notifications`
4. **HTTP method:** POST
5. **Payload:** send the new row (include `id`)
6. **HTTP headers:** add `x-webhook-secret: <NOTIFICATION_WEBHOOK_SECRET value>`

The function reads `record.id`, atomically claims the row (`pending` → `processing`) so retries cannot double-send, and records `attempts`. Rows stuck in `processing` (e.g. function crash) can be reset to `pending` and replayed manually.

### User opt-in

- **Profile → Notifications:** email, SMS, and push default **off** until enabled.
- SMS requires a **phone** on the profile.
- Push requires a **native** iOS/Android build (EAS dev client or production build); Expo Go is unreliable for push. Uses EAS `projectId` from [`app.json`](../app.json).

### Manual notification smoke

1. Patient and doctor each opt in to email (and SMS if phone set) on Profile.
2. Patient books → doctor receives pending rows; patient receives booking received rows.
3. Doctor confirms → patient `visit_confirmed` deliveries.
4. Check **Table Editor → `notification_deliveries`** for `sent` / `skipped` / `failed`.
5. Cancel or reschedule → both parties get appropriate `event_type`s.

---

## Phase 0 acceptance (from deployment plan)

> New engineer follows RUNBOOK and completes **one booking on web**.

When that passes, Phase 0 is done. Full pilot checklist: [DEPLOYMENT_PLAN.md](../DEPLOYMENT_PLAN.md) verification matrix.
