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

All schema lives in [`supabase/migrations/`](../supabase/migrations/). Files run in **filename order**, and every file is **idempotent**: re-running the whole chain leaves the database unchanged (CI checks this, §2b).

**Option A: migration script (recommended).** `scripts/db.sh` wraps the Supabase CLI (pinned, run through npx; nothing to install).

```bash
cp .env.migrate.example .env.migrate   # then paste the Session pooler URL (Dashboard → Connect)
npm run db:status                      # local files vs. what the database has applied
npm run db:plan                        # dry run: what push would apply
npm run db:push                        # runs the local migration tests, shows the plan, asks you to type the host, applies
```

| Command | What it does |
|---|---|
| `npm run db:status` | Lists every migration file and whether the target database has it recorded as applied |
| `npm run db:plan` | Dry run of `push` |
| `npm run db:push` | `db:test` first (needs Docker; `-- --skip-tests` to skip), then the plan, a typed confirmation, and the apply. `-- --yes` confirms non-interactively (CI) |
| `npm run db:baseline -- <version>` | Records migrations up to `<version>` as already applied, **without running them**. One-time, for databases set up through the SQL Editor (§2a) |
| `npm run db:new -- <name>` | Creates `supabase/migrations/<timestamp>_<name>.sql` with the idempotency checklist |
| `npm run db:test` | Applies the whole chain twice to a throwaway Postgres (Docker) and runs `security_tests.sql` (§2b) |

The target is `SUPABASE_DB_URL` from your shell or `.env.migrate` (gitignored). The script never prints the password. Use the **Session pooler** string (port 5432); the direct connection is IPv6-only.

**Option B: SQL Editor.** Run each file as a **New query**, top to bottom, waiting for success before the next.

| Step | File | Notes |
|------|------|--------|
| 1 | [`20260317000000_init.sql`](../supabase/migrations/20260317000000_init.sql) | Core tables, sign-up trigger, `current_role()`, base RLS |
| 2 | [`20260318000000_enterprise_scheduling.sql`](../supabase/migrations/20260318000000_enterprise_scheduling.sql) | Beneficiaries, holds, blackouts, appointment extensions |
| 3 | [`20260319000000_doctor_appointment_context.sql`](../supabase/migrations/20260319000000_doctor_appointment_context.sql) | Doctor read access to holder profiles and beneficiaries |
| 4 | [`20260320000000_profile_extensions.sql`](../supabase/migrations/20260320000000_profile_extensions.sql) | Optional profile medical/contact fields |
| 5 | [`20260321000000_avatars_bucket.sql`](../supabase/migrations/20260321000000_avatars_bucket.sql) | Avatars storage bucket (upload UI deferred; harmless) |
| 6 | [`20260918000000_invites_and_account_management.sql`](../supabase/migrations/20260918000000_invites_and_account_management.sql) | `is_active` on profiles, `doctor_invites`, `claim_doctor_invite` |
| 7 | [`20260918000100_blackout_delete_policy.sql`](../supabase/migrations/20260918000100_blackout_delete_policy.sql) | Doctor **delete** on own `blackout_rules` (Phase 5) |
| 8 | [`20260919000000_phase7_slot_security.sql`](../supabase/migrations/20260919000000_phase7_slot_security.sql) | **Phase 7:** slot hold/book RPCs, drop broad slot UPDATE policy, `admin_audit_log` |
| 9 | [`20260920000000_notifications.sql`](../supabase/migrations/20260920000000_notifications.sql) | Notification preferences, push tokens, delivery outbox, appointment triggers |
| 10 | [`20260921000000_security_hardening.sql`](../supabase/migrations/20260921000000_security_hardening.sql) | **Required.** Role-escalation fixes, transactional booking RPCs, appointment write lockdown, invite/claim hardening, function privileges, indexes. See §7a. |
| 11 | [`20260922000000_enforce_account_deactivation.sql`](../supabase/migrations/20260922000000_enforce_account_deactivation.sql) | Deactivated accounts (`profiles.is_active = false`) lose all data access immediately, including RPCs, even with a live session |
| 12 | [`20260922000100_beneficiary_integrity.sql`](../supabase/migrations/20260922000100_beneficiary_integrity.sql) | One `self` beneficiary per account (unique index); aborts with merge instructions if duplicates exist |
| 13 | [`20260922000200_doctor_next_available_view.sql`](../supabase/migrations/20260922000200_doctor_next_available_view.sql) | `doctor_next_available_slots` view (one row per doctor, RLS-respecting) + slot index |
| 14 | [`20260922000300_notification_retry.sql`](../supabase/migrations/20260922000300_notification_retry.sql) | `claimed_at` on `notification_deliveries` for retries / stuck-row recovery (see §12 sweep) |
| 15 | [`20261127000000_account_deletion.sql`](../supabase/migrations/20261127000000_account_deletion.sql) | `delete_my_account()` RPC: patient self-service deletion (App Store / Google Play). Cancels upcoming visits, releases holds, deletes the auth user (data cascades). **Redeploy `dispatch-notifications`** (§12) with it so doctors' "visit cancelled" messages keep the visit details |
| 16 | [`20261128000000_clinic_sessions.sql`](../supabase/migrations/20261128000000_clinic_sessions.sql) | **Clinic sessions** (first come, first served): `clinic_sessions`, `clinic_session_availability` and `doctor_next_open_session` views, RPCs `create_clinic_sessions`, `cancel_clinic_session`, `book_session`, `move_session_booking`; `hospital_settings.time_zone` (**set it**, see §6a). Notification trigger updated (`visit_booked`; doctors not messaged per patient). **Redeploy `dispatch-notifications`** (§12) |
| 17 | [`20261128000100_doctor_department.sql`](../supabase/migrations/20261128000100_doctor_department.sql) | `doctor_invites.department`; `claim_doctor_invite` copies it to the doctor (default "Outpatients") |
| 18 | [`20261128000200_session_room.sql`](../supabase/migrations/20261128000200_session_room.sql) | `clinic_sessions.room`; `create_clinic_sessions` gains `p_room` (old 7-argument version dropped); `update_clinic_session` (room + patient limit, never below places booked) |
| 19 | [`20261128000300_remove_family_members.sql`](../supabase/migrations/20261128000300_remove_family_members.sql) | `beneficiaries.archived_at`; `remove_beneficiary` (not "self", not with upcoming visits); `book_session` refuses removed family members |
| 20 | [`20261128000400_validate_time_zone.sql`](../supabase/migrations/20261128000400_validate_time_zone.sql) | Trigger rejecting unknown `hospital_settings.time_zone` values (an invalid zone would break every session check) |
| 21 | [`20261128000500_admin_notification_deliveries.sql`](../supabase/migrations/20261128000500_admin_notification_deliveries.sql) | Admins read `notification_deliveries`; `retry_notification_delivery` resets a failed row for the §12 retry sweep. **Redeploy `dispatch-notifications`** (room and cancellation reason in messages) |
| 22 | [`20261128000600_remove_legacy_slots.sql`](../supabase/migrations/20261128000600_remove_legacy_slots.sql) | **Removes the retired slot system**: tables `appointment_slots`, `slot_holds`, `blackout_rules`, view `doctor_next_available_slots`, the seven slot/hold RPCs, the pg_cron hold sweep, `appointments.slot_id` and `hospital_settings.buffer_minutes`. **Deletes slot/hold/blackout data.** Older bookings keep their date and time. Steps 2, 7, 8, 10 and 13 created these; they still run in order on a new database |
| 23 | [`20261129000000_hospital_info_and_settings.sql`](../supabase/migrations/20261129000000_hospital_info_and_settings.sql) | `hospital_info` (public contact details, admin-edited in **Settings**; phone/email start empty), platform settings on `hospital_settings` (booking window, check-in, reminders, no-shows, waitlist), `check_in_secret` + `rotate_check_in_code()`; changes are audited. See §6b |
| 24 | [`20261129000100_visit_queue.sql`](../supabase/migrations/20261129000100_visit_queue.sql) | **Arrival queue**: status `no_show`; check-in/queue columns; `check_in_visit`, `advance_visit`, `call_next_in_queue`, `get_queue_status`, `book_follow_up`; `clinic_session_progress` view; booking window enforced. **Redeploy `dispatch-notifications`** (new message types, push deep links) |
| 25 | [`20261129000200_reminders_and_waitlist.sql`](../supabase/migrations/20261129000200_reminders_and_waitlist.sql) | Reminders (evening before, morning of), automatic no-shows and waitlist expiry via `run_visit_housekeeping()` every 10 min (**needs pg_cron**, see §6b); `session_waitlist` with automatic booking when a place frees up; availability views gain `waitlist_count` / `in_booking_window` |
| 26 | [`20261129000300_visit_reports.sql`](../supabase/migrations/20261129000300_visit_reports.sql) | `visit_report(from, to)`: attendance, no-show rate and waiting times for admins (**Reports**) |
| 27 | [`20261129000400_query_performance.sql`](../supabase/migrations/20261129000400_query_performance.sql) | **Performance only, same results.** RLS policies check the caller once per query instead of once per row (doctor-only checks run only for doctors); indexes for the admin visit list, patient search (`pg_trgm`, installed into `extensions`), the updates feed and foreign-key deletes; availability views read the hospital clock once. Builds indexes with a brief write lock, so run it at a quiet time on a large database |

### 2a. Existing databases (set up through the SQL Editor)

Databases built by pasting files into the SQL Editor have an **empty migration history**, so a plain `db:push` would try to re-run everything from step 1. Record what's already there first, **once**:

1. Work out the last migration you applied by hand. For example, if you ran steps 1–10 (through `20260921000000_security_hardening.sql`), the version is `20260921000000`.
2. Run `npm run db:baseline -- 20260921000000`. It lists the files it will mark and asks you to type `baseline`.
3. Run `npm run db:plan`. It should show only the migrations after that version (steps 11–14 at the time of writing).
4. Run `npm run db:push`.

Earlier files only gained `drop policy if exists` guards during the migration cleanup, so their contents match what you ran by hand. If unsure whether a step was applied, baseline only up to the last one you're certain of: every migration is idempotent, so re-running an applied one is safe.

### 2b. Testing migrations

`bash supabase/tests/run.sh` builds a throwaway Postgres 17 (Docker), applies the chain **twice** (fails if the second run changes anything), then runs [`security_tests.sql`](../supabase/tests/security_tests.sql): role escalation, invite claiming, holds, booking/reschedule/cancel, double booking, function privileges. CI runs the same script on every PR. Add a test there when you add a policy or RPC.

New migrations: create them with `npm run db:new -- <name>` (names them `YYYYMMDDHHMMSS_<name>.sql`), guard every `create policy` with `drop policy if exists`, and use `if not exists` / `create or replace` elsewhere.

**Verify after migrations:**

```sql
select table_name from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'profiles', 'doctors', 'clinic_sessions', 'appointments',
    'beneficiaries', 'doctor_invites', 'hospital_settings',
    'notification_preferences', 'push_device_tokens', 'notification_deliveries',
    'admin_audit_log'
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

3. Sign in as that user and open **Schedule** to add clinic sessions (one-off or weekly), or have an admin do it from **Roster → Schedule**.

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
| 3 | **Book Appointment** → pick doctor → pick session | Sessions show places left; nothing is reserved until **Book** |
| 4 | Intake → confirm | Success state; no hard error |
| 5 | **My Visits** | New appointment visible (typically **pending**) |
| 6 | *(Optional)* Sign in as the doctor | Booking appears under that session on **Agenda**; session shows “1 / N booked” |

If no doctors or sessions appear, finish [§4 Doctor bootstrap](#4-doctor-bootstrap-until-phase-1-in-app-invites) and ensure `doctors.is_accepting_bookings = true` and the doctor has a future session with places left.

---

## 6a. Clinic sessions (migration step 16)

Booking is by **clinic session**, first come, first served. A session is a doctor, a date, start/end times and a patient limit (1–200).

| RPC | What it does |
|---|---|
| `create_clinic_sessions` | Doctor (own) or admin. One date, or weekly on chosen weekdays for 1–26 weeks. Skips dates that overlap an existing session or have already ended |
| `cancel_clinic_session` | Doctor (own) or admin. Deletes a session nobody booked; otherwise marks it cancelled and cancels its bookings (patients notified) |
| `book_session` | Patient books a place for themselves or a family member. Confirmed immediately. Refuses full, cancelled or ended sessions, a doctor not accepting bookings, and duplicate bookings for the same person |
| `move_session_booking` | Moves a booking to another session of the same doctor (same checks) |

Capacity is a live count of non-cancelled bookings, checked under a row lock on the session, so the last place can't be sold twice. Clients cannot write `clinic_sessions` or change `appointments.session_id` directly.

**Set the hospital time zone** (session times are local wall-clock times; the database runs in UTC). It decides when a session has "ended" for booking. Admins can set it in **Settings → Hospital time zone**, or in SQL:

```sql
update public.hospital_settings set time_zone = 'Africa/Lagos' where id = 1;  -- your IANA zone
```

The older slot, hold and blackout system was removed by step 22.

## 6b. Hospital details, check-in, queue, reminders, waitlist (steps 23–26)

**After deploying, an admin opens Settings and:**

1. Fills in **Hospital information** (name, phone, email, address, opening hours). They appear on the About screen, the Privacy Policy, Terms and the account deletion page, and in message subjects. App stores require a working contact.
2. Checks **Booking & visits**: booking window (default 60 days), check-in opening (120 min before a session), reminders (6 PM the evening before, 7 AM on the day), automatic no-shows (30 min after a session ends) and the waitlist. All are in the hospital time zone.
3. Prints the **Check-in poster** and puts it at reception. Patients scan it in the app (or type the 6-character code) to join the queue. **New code** invalidates the old poster immediately.

**Visit flow on the day**

| Step | Who | How |
|---|---|---|
| Check in | Patient (code) or staff (no code) | `check_in_visit` — opens `check_in_opens_minutes` before the session, closes at its end; assigns the next queue number |
| Call in | Doctor / admin | **Call next** (`call_next_in_queue`) or per patient (`advance_visit … 'call'`). The patient gets a push + SMS ("It's your turn"); whoever is now first in line gets "You're next" (push) |
| Seen / no-show | Doctor / admin | `advance_visit … 'complete' / 'no_show'` (only once the session has started or the patient has checked in) |
| Follow-up | Doctor / admin | `book_follow_up` into a future session of the same doctor (ignores the booking window and "accepting bookings") |

Reception staff use admin accounts: **Clinics → Open queue** marks patients without the app as arrived.

**Known limitation:** the poster code is static, so someone who photographed it could check in before arriving (within the check-in window). Keep the check-in window short, issue a **New code** if it circulates, and treat the queue number as advisory if staff see someone arrive later than their check-in.

At the end of each session (plus the grace period, if automatic no-shows are on) housekeeping closes anything still open: called-in patients become **seen**, booked or checked-in-but-never-called patients become **no-shows**. Waitlists close when the session starts.

**Scheduled housekeeping (pg_cron).** Step 25 schedules `select public.run_visit_housekeeping()` every 10 minutes **only if pg_cron is enabled** (Dashboard → Database → Extensions → `pg_cron`; then re-run step 25). Without it no reminders are sent and no-shows are not recorded automatically (the migration prints a notice). Check it is scheduled:

```sql
select jobname, schedule from cron.job where jobname = 'visit-housekeeping';
```

Messages still go through `notification_deliveries` → Database Webhook → `dispatch-notifications`, so the §12 webhook and retry sweep must be set up too.

**Waitlist.** When a session is full, patients can join its waitlist (`join_waitlist`) until it starts. When a place frees up before the start (cancellation, a booking moved away, a higher patient limit) the first person waiting is booked automatically (`source = 'waitlist'`) and told. Waitlists close when the session starts or is cancelled.

Time-sensitive messages that are retried too late ("it's your turn" after 10 minutes, "you're next" after 15, same-day reminders after 4 hours) are skipped rather than sent.

## 7. Security notes

Booking writes go through **SECURITY DEFINER RPCs**; patients have no direct INSERT/UPDATE on `appointments`, and clients can't write `clinic_sessions` (see §6a for the session RPCs).

| RPC | Purpose |
|-----|---------|
| `cancel_appointment` | Patient, doctor or admin cancels a booking; frees the session place |
| `delete_my_account` | Patient self-deletion (step 15) |
| `remove_beneficiary` | Hide a family member (step 19) |
| `retry_notification_delivery` | Admin re-queues a failed message (step 21) |

Other rules:

- Doctors may update their own appointments directly, but only `status` (pending→confirmed/cancelled, confirmed→completed/cancelled), `room`, `video_url` and `notes`. `video_url` must be `https://`. Nobody can change `session_id` directly.
- Deactivated accounts (`profiles.is_active = false`) lose all data access, including RPCs, even with a live session (step 11).
- Internal SECURITY DEFINER helpers (`enqueue_notification_deliveries`, `log_admin_audit`, trigger functions, `session_booking_error`) are not executable by `anon`/`authenticated`.
- **Admin audit:** `admin_audit_log` (admins read-only) records doctor invite creation/revocation and account deactivation/reactivation; shown in the app under **Activity**.

History: steps 8 and 10 introduced slot-hold RPCs (`hold_slot_if_available`, `book_appointment_from_hold`, …) for the original slot model. Step 22 removed them.

---

## 8. Optional seed file

[`supabase/seed_pilot.sql`](../supabase/seed_pilot.sql) contains **commented templates only** (admin note, doctor row, sample clinic sessions, invite). It is not run automatically by the app. Uncomment and edit UUIDs/dates when you want copy-paste examples.

---

## 9. Troubleshooting

| Symptom | Check |
|---------|--------|
| “Invalid API key” / network errors | `.env` URL and anon key; restart dev server |
| Login works but wrong screens | `profiles.role`; sign out/in; `is_active = true` |
| No doctors in picker | `doctors` row exists, `is_active`, `is_accepting_bookings` |
| No sessions | Doctor **Schedule** tab (or admin **Roster → Schedule**); session `status = 'scheduled'`, not ended, places left. Wrong “ended” cut-off → check `hospital_settings.time_zone` (§6a) |
| RLS errors in console | Migrations 1–4 applied; user authenticated |

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
| Onboarding | Admin invite → doctor claim → Schedule: add weekly sessions |
| Patient book | Doctor → session (places left) → details → Book; “You’re booked” shows the session and arrival note |
| Sessions | Fill a session to its limit → it disappears for patients; cancel a booked session → patients get “visit cancelled” |
| Lifecycle | Mark complete → patient Past |
| Account | Forgot password; admin deactivate |
| UX spot-check | Add dependent “Book now” vs “Add only”; change session from My Visits |
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

**Dependencies:** the function runs on Deno, not Node, so it doesn't use `package.json`. Its imports are pinned in `supabase/functions/dispatch-notifications/deno.json` (import map) and `deno.lock` (content hashes). To bump `@supabase/supabase-js`, edit the URL in `deno.json`, then run `deno check index.ts` in that folder to refresh `deno.lock`, and commit both. CI runs `deno check --frozen`, which fails if the lockfile is out of date.

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

The function reads `record.id`, atomically claims the row (`pending` → `processing`, setting `claimed_at`) so duplicate calls cannot double-send, and records `attempts`. A failed send returns to `pending` until it has been tried **3 times**, then becomes `failed`.

### Retry sweep (schedule this)

The webhook only fires on INSERT, so retries and crash recovery need a scheduled call. In **Dashboard → Integrations → Cron → Create job**:

1. **Schedule:** every 5 minutes (`*/5 * * * *`)
2. **Type:** Supabase Edge Function → `dispatch-notifications`, method POST
3. **Headers:** `x-webhook-secret: <NOTIFICATION_WEBHOOK_SECRET value>`, `Content-Type: application/json`
4. **Body:** `{"sweep": true}`

Each sweep resets rows stuck in `processing` for over 10 minutes back to `pending`, then sends up to 50 `pending` rows older than 1 minute that are under the attempt limit. The response lists what it recovered and processed.

Manual run: `curl -X POST https://<ref>.supabase.co/functions/v1/dispatch-notifications -H "x-webhook-secret: $SECRET" -H "Content-Type: application/json" -d '{"sweep":true}'`

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

---

## 13. CI/CD with EAS (builds, OTA updates, web hosting, store submission)

Two systems, two jobs:

| System | Files | Runs | Purpose |
|---|---|---|---|
| **GitHub Actions** | `.github/workflows/ci.yml` | every PR + push to `main` | Typecheck, lint, unit tests, migration + security tests, Edge Function typecheck |
| **EAS Workflows** | `.eas/workflows/*.yml` | see below | Native builds, OTA updates, web deploys, store submission |

### EAS workflows

| Workflow | Trigger | What it does |
|---|---|---|
| `pr-preview.yml` | PR opened / updated | Web preview at `…--pr-<n>.expo.app`, OTA update on branch `pr-<n>`, PR comment with links/QR |
| `deploy-production.yml` | push to `main` | Fingerprints native code. **Unchanged** → OTA update to the `production` channel. **Changed** → new production store builds. Always deploys the website to production |
| `preview-builds.yml` | manual | Internal-distribution builds for testers (`preview` channel) |
| `submit-production.yml` | manual | Submits the latest production builds: TestFlight, and the Play **internal** track as a **draft** |

Run a manual workflow from **expo.dev → project → Workflows**, or:
`npx eas-cli workflow:run .eas/workflows/preview-builds.yml`

### Build profiles, channels, environments (`eas.json`)

| Profile | Distribution | EAS environment | Update channel |
|---|---|---|---|
| `development` | internal (dev client) | development | development |
| `preview` | internal | preview | preview |
| `production` | store (auto-incremented build number) | production | production |

`runtimeVersion` uses the **fingerprint** policy (`app.json`). An OTA update only reaches builds whose native code matches, so a JS-only change ships as an update and a native change needs a new build. `deploy-production.yml` decides this automatically.

### Environment variables

Builds and web deploys read **EAS environment variables**, not `.env`. `.env` is gitignored, so it never reaches EAS. Project-scoped variables, set in all three environments:

| Variable | Visibility | Notes |
|---|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | plaintext | Supabase project URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | sensitive | Public client key (embedded in the app by design; RLS protects data) |

All three environments currently point at the **same** Supabase project. To give preview builds a staging database later, update the `development`/`preview` values:

```bash
npx eas-cli env:update --name EXPO_PUBLIC_SUPABASE_URL --environment preview --value https://<staging-ref>.supabase.co
npx eas-cli env:list --environment production      # check
```

Server secrets (`NOTIFICATION_WEBHOOK_SECRET`, Resend, Twilio) are **Supabase Edge Function secrets** (§12), never EAS or `EXPO_PUBLIC_*` variables.

### One-time setup (account owner)

1. **Connect GitHub to EAS:** expo.dev → `@lazpet/fame-hospital-bookings` → **Project settings → GitHub** → install the Expo GitHub app on `Sirjoseph94/fame-hospital-booking`. Without it, the push/PR triggers and PR comments won't fire.
2. **Signing credentials**, needed before any workflow build:
   - Android: `npx eas-cli credentials:configure-build -p android -e production` (lets EAS generate and store the upload keystore). Repeat with `-e preview` for preview builds.
   - iOS: `npx eas-cli credentials:configure-build -p ios -e production` (signs in to your Apple Developer account and creates the certificate and provisioning profile). Repeat with `-e preview`. Ad hoc builds also need test devices registered: `npx eas-cli device:create`.
3. **First web deploy** (claims the hosting subdomain): `npx expo export -p web && npx eas-cli deploy`. Workflows can deploy after that.
4. **Store submission** (before using `submit-production.yml`):
   - iOS: create the app in App Store Connect (bundle ID `org.famehmrc.booking`), then add an App Store Connect API key: `npx eas-cli credentials -p ios` → App Store Connect API Key.
   - Android: create the app in Google Play Console. **Upload the first AAB manually** (Google requires it). Then add a Google service account key: `npx eas-cli credentials -p android` → Google Service Account.
   - **Account deletion** (both stores require it): in-app it is Profile → Delete account. For Play Console → App content → Data safety → "Delete account URL", and App Store Connect review notes, use `https://<your-web-domain>/delete-account` (public page with the steps). Doctor/admin accounts are closed by an admin, not self-service.
5. **Protect `main` on GitHub** so merges require the CI checks (`check`, `migrations`, `edge-functions`). `deploy-production.yml` deploys whatever lands on `main`.

### Database and Edge Functions are not deployed by CI

Migrations (§2, `npm run db:push`) and the Edge Function (§12) are deployed by hand, **before** the app build or update that depends on them. This is deliberate: a bad migration can't be undone with a rollback.

### Dependencies and the lockfile (EAS runs on Linux)

EAS Android builds and web deploys run on **Linux x64**, and iOS builds on macOS. Several packages ship a native binary per platform (lightningcss for NativeWind, Expo's noxcturnal, @parcel/watcher, the ESLint resolver), so `package-lock.json` must list **every** platform's binary. npm 10 silently drops other platforms' binaries when you `npm install <pkg>` with `node_modules` present. Your Mac keeps working, and EAS fails with errors like `Cannot find module '../lightningcss.linux-x64-gnu.node'`.

| Command | When |
|---|---|
| `npm run check:lockfile` | After any dependency change (≈1 s). Also runs in CI and as EAS's `eas-build-pre-install` hook, so a bad lockfile fails fast with this message |
| `npm run lock:regen` | When the check fails: rebuilds the lockfile in a clean directory with npm 10.9.2, verifies it, and reinstalls with `npm ci` |
| `npm run check:linux` | Before pushing dependency changes: clean `npm ci` + metro config + web export in a `linux/amd64` Docker container (the EAS/CI environment) |

You can't give EAS Build a Dockerfile; it uses Expo's build images (selectable with `image` in `eas.json`). Docker is for **reproducing** that Linux environment locally (`check:linux`).

### Rolling back

- **OTA update:** `npx eas-cli update:republish --channel production` (choose the previous update group), or roll back in expo.dev → Updates.
- **Website:** expo.dev → Hosting → Deployments → promote an earlier deployment to production.
- **Native build:** submit the previous build, or ship a fix through the normal flow.

## Phase 0 acceptance (from deployment plan)

> New engineer follows RUNBOOK and completes **one booking on web**.

When that passes, Phase 0 is done. Full pilot checklist: [DEPLOYMENT_PLAN.md](../DEPLOYMENT_PLAN.md) verification matrix.
