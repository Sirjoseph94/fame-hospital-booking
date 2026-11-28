# Plan: Enterprise Hospital Schedule & Appointment Management (UI)

> **Historical document.** This plan describes the original one-patient-per-slot
> booking model (holds, blackouts, post-visit buffers), which was replaced by
> first-come-first-served clinic sessions and removed in migration 22. For how the
> app works today see [README.md](README.md) and [docs/RUNBOOK.md](docs/RUNBOOK.md).

Status: **approved** — implementing Step 1 only, then stopping for review.

Build order is **strictly sequential**. After each numbered step: `tsc --noEmit` + lint, report what changed, **stop for review**. Do not batch steps.

---

## 1. What exists today

Expo SDK **57** managed app (`FAME Hospital Booking`), **not** Expo Router.

| Area | Current | Spec target |
|---|---|---|
| Entry | `App.tsx` + `expo/AppEntry.js` | `expo-router` file routes, Metro web |
| Nav | React Navigation v6 stacks + tabs per role | Role-scoped route groups + **real** role guards |
| Auth | Supabase email/password + `AuthContext` | Supabase authentication; final role-entry behavior pending §8 |
| Data | Live Supabase tables (`patient_id` only) | Supabase-backed `lib/services/scheduling.ts` (no fixture mocks) |
| Domain | One patient = one booker | `accountHolderId` **and** `beneficiaryId` on every appointment |
| UI | `StyleSheet`, teal `#0f6d5c`, Ionicons | NativeWind v4 tokens, lucide-react-native |
| Lint | **No** ESLint / `lint` script | Typecheck **and** lint must pass |
| Web | Metro web already in `app.json` | First-class: Sheet, calendar export, shadows, breakpoints |

There is **no** `Card` primitive, no NativeWind, no slot-hold, no proxy/beneficiary model, no QR, no calendar export, no kitchen-sink.

**Interpretation:** this is a **replacement of the product surface**, not an incremental restyle. Supabase authentication stays. Existing profile/invite/account-management screens are removed; whether their database-backed role/profile records remain authoritative is pending §8.

---

## 2. Proposed target layout

Routes live only under `app/` (Expo Router rule). Screens that grow stay in `components/` or `lib/`; nothing but route files in `app/`.

```
app/
  _layout.tsx                 # providers, fonts, gesture/reanimated, session hydrate
  (auth)/sign-in.tsx          # Supabase authentication
  (auth)/sign-up.tsx          # patient registration
  (patient)/_layout.tsx       # tabs + role guard
  (patient)/index.tsx         # Home
  (patient)/visits.tsx
  (patient)/book/_layout.tsx  # stack
  (patient)/book/doctor.tsx
  (patient)/book/slot.tsx
  (patient)/book/intake.tsx
  (patient)/book/confirmation.tsx
  (doctor)/_layout.tsx
  (doctor)/agenda.tsx
  (doctor)/blackout.tsx
  (admin)/_layout.tsx
  (admin)/roster.tsx
  (admin)/appointments.tsx
  (admin)/capacity.tsx
  (admin)/doctor/[id]/blackout.tsx
  dev/kitchen-sink.tsx        # /dev/kitchen-sink
lib/
  platform.ts
  services/auth.ts            # Supabase auth adapter
  services/scheduling.ts      # Supabase scheduling + latency + typed errors
  services/calendarExport.ts
  stores/session.ts           # zustand + persist
  stores/booking.ts           # hold, selected beneficiary, draft
types/scheduling.ts
components/ui/                # Card, Sheet, primitives
tailwind.config.js            # ONLY place hex tokens live
global.css
```

Path alias: remap `@/*` from `src/*` to project root so `@/lib`, `@/components`, `@/types` match the spec.

**Root `/`:** Expo Router requires a `/` route. `(patient)/index` is `/`. Unauthenticated users hitting `/` redirect to `/role-select`. Doctors/admins hitting `/` are redirected by the **patient** guard to their shell (not left on a blank stack).

---

## 3. Stack install (SDK-aligned)

Install with `npx expo install` where an Expo package exists.

**Named in STACK (will install):**
expo-router, nativewind@4 + tailwindcss (v3 line for NativeWind v4), react-hook-form, zod, zustand, date-fns (already present), lucide-react-native, expo-haptics, expo-linking, expo-calendar, react-native-qrcode-svg, react-native-safe-area-context (present), react-native-gesture-handler, react-native-reanimated.

**Required by the brief but not in the STACK bullet — need your OK:**

| Package | Why | Web |
|---|---|---|
| `expo-secure-store` | Supabase/session persist on native | No — `localStorage` fallback on web |
| `@gorhom/bottom-sheet` | Native `Sheet` impl as specified | Not used on web (Modal + slide-up) |
| `react-native-svg` | Peer of `react-native-qrcode-svg` | Yes (`react-native-svg/web`) |
| `eslint` + `eslint-config-expo` | Spec requires lint | n/a |
| NativeWind babel/metro wiring (`global.css`) | v4 requirement | Yes |

**Will not add:** `@expo/ui`, React Query/SWR, NativeWind v5, a second icon set. In-screen icons = lucide. Tab bars = Expo Router tabs (JS tabs for identical iOS/Android/web chrome; NativeTabs is iOS-first and fights “one shell per role on web”).

**Keep:** `@supabase/supabase-js`, `src/lib/supabase.ts` (adapted as needed), and `supabase/`.

**Remove after cutover (step 1 or when unused):** `@react-navigation/*`, `@react-native-async-storage/async-storage` (unless required by the Supabase adapter), `@expo/vector-icons` if unused, and replaced `src/**` screens/nav.

**NativeWind v4 fallback:** try v4 first. If its Metro integration proves incompatible with SDK 57, report the failure and fall back to `constants/theme.ts` + `StyleSheet`. Colors remain centralized, preserving the no-hardcoded-hex criterion. Do not silently move to NativeWind v5.

---

## 4. Domain, Supabase auth, and scheduling data

### Types (`types/scheduling.ts`) — exact unions from the brief

`Role`, `Session`, `Beneficiary`, `Doctor`, `Slot`, `Appointment`, `SlotHold`, `BlackoutRule`.

Never use `patientId` as a stand-in for either holder or beneficiary.

### Authentication and roles

Supabase remains the identity provider. Authentication happens first; the app derives its typed `{ userId, role, displayName }` session from the authenticated Supabase `profiles` row and routes directly to that role's shell. The app-facing session is mirrored in zustand.

**Approved deviation:** there is no mock role-select screen and users cannot switch roles in-app. This supersedes the original requirement that `app/(auth)/role-select.tsx` be the review entry point. Reviewing all roles requires separate Supabase accounts whose `profiles.role` values are patient, doctor, and admin.

### Services

`lib/services/scheduling.ts` implements:

- Patient: `listBeneficiaries`, `listDoctors`, `listSlots`, `holdSlot`, `confirmBooking`, `listAppointments`, `rescheduleAppointment`, `cancelAppointment`
- Admin (+ doctor blackout): `listAllAppointments`, `setBlackout`

Plus whatever list/blackout reads doctor agenda needs — **same module**, no extra package.

**Typed errors** (not strings): `SLOT_TAKEN` | `HOLD_EXPIRED` | `NETWORK_ERROR`.

**Latency:** ~400–800ms on every call so skeletons are reviewable.

**Holds:** 5-minute TTL. Countdown derived from `expiresAt`, re-computed on `AppState` `active` (and web `visibilitychange` via `lib/platform.ts`).

**Deliberate failures:** kitchen-sink controls deterministically force `SLOT_TAKEN`, `HOLD_EXPIRED`, and `NETWORK_ERROR`; no random failures.

### Persistence

Supabase auth storage/session: native `expo-secure-store`, web `localStorage`, with the app-facing typed session mirrored in zustand. Booking draft (hold, beneficiary, type) in zustand; persist hold `expiresAt` so a reload mid-book can restore or expire cleanly.

---

## 5. Platform rules (`lib/platform.ts`)

Centralize: `isWeb`, `isNative`, `useBreakpoint()` (`phone` <768, `tablet` 768–1024, `desktop` >1024). Screens do **not** call `Platform.OS`.

| Concern | Native | Web |
|---|---|---|
| Card shadow | iOS shadow* / Android elevation (existing two-way) | NativeWind `boxShadow: 0px 4px 20px rgba(0,0,0,0.04)` — **only** inside Card |
| Sheet | `@gorhom/bottom-sheet` | `Modal` + slide-up + backdrop |
| Calendar | `expo-calendar` + permission; on deny show manual copy/ICS fallback | `.ics` blob download |
| Haptics | `expo-haptics` behind `isNative` | no-op |
| Hover | none | `Platform.select` / NativeWind `hover:` on pressables; **min 48×48** still |

Tokens only in `tailwind.config.js`: `surface`, `surface-muted`, `ink`, `ink-muted`, `primary`, `available`.

---

## 6. Screens by step (what ships, what does not)

### Step 1 — foundation (stop)

- `lib/platform.ts`, tokens, `Card` (3-way shadow)
- `types/scheduling.ts`, mocks, `scheduling` + mock auth services
- `role-select`, session persist, **working** guards on `(patient)` / `(doctor)` / `(admin)`
- Expo Router + NativeWind + lint wired; `App.tsx` entry retired
- **Out of step 1:** booking UI, primitives beyond Card

### Step 2 — primitives + `/dev/kitchen-sink` (stop)

`BeneficiaryPill`, `VisitCard`, `SlotChip` (available / selected / held-by-other / booked / blackout), `AppointmentTypeToggle`, `Sheet`. Kitchen-sink renders every state. Ungated in this mock (question if you want it hidden when “signed in as patient”).

### Step 3 — Patient Home + book (stop)

Home: last/next visit, primary **Book Appointment** CTA, beneficiary sheet, add-patient sheet.

Booking stack: doctor → slot (hold + countdown) → type toggle → intake/review → confirmation (calendar export + QR).

**3-tap returning path (documented, not hidden):**

1. Home → **Book Appointment**, using the returning patient's last doctor and preselected **self**
2. Slot grid → tap an **available** slot (auto-hold)
3. Confirmation → **Confirm** (intake skipped when returning + no required fields left)

**Flagged as >3 taps (will not hide):** first-time book, new beneficiary, changing visit type, reschedule, any intake field that is required for a first visit. If you reject skip-intake, the returning path **cannot** hit confirmation in 3 taps — see §8.

### Step 4 — My Visits (stop)

Tabs: Upcoming / Past / Proxy Managed. Reschedule: alternatives first, two taps to migrate. Cancel with confirm. Directions via `expo-linking` (maps URL). Telehealth **T-minus-15** join affordance on upcoming telehealth cards.

### Step 5 — Doctor (stop)

Daily itinerary with **15-minute buffers** drawn between visits and excluded from bookable slots. The buffer duration is an admin-managed scheduling setting (default 15 minutes). Proxy tag: `Booked by {accountHolder} [{relationship}]`. Own blackout screen (`setBy: 'doctor'`).

### Step 6 — Admin (stop)

Desktop-first: roster + appointments + capacity as a **side nav ≥768px**, bottom tabs on phone (usable, not blocked). Blackout-on-behalf is a stack screen from roster. Proxy tags on appointment list. Capacity = today's per-doctor utilization (booked vs available vs blackout) — no charts library. Admin availability controls include configurable appointment-buffer minutes.

**Blackout meaning:** a blackout is one non-repeating unavailable period for one doctor, with a start date/time, end date/time, and reason (for example, surgery from 13:00–16:00). Slots overlapping it become unavailable. Doctors can create their own; admins can create one on a doctor's behalf. Repeating weekly availability is outside scope.

Hospital details appear in an About/Contact footer rather than driving directions. No hospital-address/map action is included. The exact contact copy can be supplied before Step 3/4.

### Step 7 — states pass (stop)

Skeletons (not spinner-only), empty, `SLOT_TAKEN`, `HOLD_EXPIRED` + re-pick, `NETWORK_ERROR` + retry, cancelled confirmation, telehealth T-minus-15 — **all three roles**.

---

## 7. Accessibility & verification

WCAG 2.1 AA: labels/roles on every touchable, Dynamic Type, `reduceMotion` gates sheet animation, `announceForAccessibility` on async changes. Slot grid: logical row-then-time reading order; web keyboard tab order + Enter/Space.

After each step: typecheck + lint.

After steps that change UI: exercise on **Expo web** (browser tools) for that step’s routes. Native iOS/Android crash-free run is an **end-of-program** acceptance item unless you have a simulator attached for an earlier step.

**Cannot honestly sign off VoiceOver/TalkBack in this environment** unless a simulator/device is available; the plan is to implement the APIs correctly and do a **keyboard-only web pass**. Flag remaining native a11y as a manual checklist.

---

## 8. Approved decisions

1. Keep Supabase for authentication; replace the old product screens and navigation.
2. Returning patients may skip intake for the documented three-interaction path.
3. Home CTA copy is **Book Appointment**.
4. Do not include Marcus in scheduling fixtures.
5. Failure injection uses deterministic kitchen-sink controls.
6. Intake has optional reason/notes and a read-only review.
7. New beneficiaries require name, relationship, date of birth, and gender; national/file IDs are optional.
8. Doctor buffers block booking and their duration is configurable by admins.
9. Capacity is today's per-doctor percentage.
10. Blackouts are single, non-repeating start/end ranges with a reason.
11. No directions/address feature; hospital details belong in About/Contact footer content.
12. QR payload is the appointment ID.
13. `/dev/kitchen-sink` is always reachable.
14. Approved: `expo-secure-store`, `@gorhom/bottom-sheet`, `react-native-svg`, ESLint.
15. Try NativeWind v4; if Metro integration fails, use centralized `constants/theme.ts` + `StyleSheet`, never v5 silently.
16. Keep **FAME Hospital Booking**.
17. Put sign-out in each role shell; no Profile tab.
18. Delete replaced `src/` code during Step 1.

---

## 9. Acceptance mapping

| Criterion | How we hit it |
|---|---|
| 3 primary interactions | Documented tap path in this file + Home copy; longer flows flagged |
| `tsc` + lint clean | Scripts `typecheck` / `lint`; run after every step |
| No hex outside Tailwind / no ad-hoc shadows | Tokens in `tailwind.config.js`; shadows only on `Card` |
| Role guards | Manual web test: doctor session + `/` and `/visits`; patient session + `/agenda` |
| Every failure path has UI | Step 7 + kitchen-sink |
| iOS / Android / web | Web during steps; native at end if simulators available |
| Calendar + Sheet native **and** web | `calendarExport.ts` + `Sheet`; verify both in step 3 |

---

## 10. Out of scope (unless you add it)

Real backend/auth, push notifications, EHR sync, payments, multi-role accounts, NativeWind v5, `@expo/ui`, extra chart libraries, rewriting this plan into product copy inside the app.
