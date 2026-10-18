# Practice Holiday Planner (Urlaubsplaner feminin)

Leave planner for a medical practice. Staff data only, never patient data.
Full plan: PLAN.md. This folder is its own app; the rest of the repository is the
patient discovery page and has nothing to do with it.

- AWS eu-central-1 only. Infrastructure as code (CDK) in /infra; deploy with `npm run deploy`.
- Frontend: plain HTML/CSS/JS in /web. No framework, no runtime CDN scripts.
- API: one Node.js Lambda in /api. All counting and validation in /api/rules.js.
- Every endpoint checks the Cognito user and group itself. User id from the token only.
- Others' entries answer 404. Notes are visible to their owner and approvers only.
- Every write uses a DynamoDB condition (rev) and writes an audit record.
- Never log notes, tokens or passwords. No secrets in the repository.
- Run `npm test` before every commit; add a test for every rule you change.
- `npm run dev` starts a local copy with an in-memory database and fake logins
  (dev/server.js). It is never deployed.

## Answers to the open questions (14 Oct 2026)

1. **Country:** Austria, the 13 national public holidays. Time zone Europe/Vienna.
2. **Team:** 7 people. 4 × Frontoffice, 1 × Backoffice, 2 × owners (Besitzer).
   The two owners approve leave (Cognito group `approver`); everyone else is `staff`.
   Roles in the app: `frontoffice`, `backoffice`, `owner`.
3. **Minimum staffing:** Frontoffice at least 2 people on every opening day.
   No minimum for the other roles.
4. **Opening days:** Monday to Friday. Mo 7–19, Tue–Thu 8–19, Fri 7–17. No afternoon
   closures, so every weekday is a full opening day.
5. **Allowance:** 25 days on a 5-day week, scaled for part-time. **Leave year = working
   year from the start date (Eintritt)**, e.g. 2 May to 1 May, as in the practice's own
   spreadsheet (and the Austrian default). Unused days stay and expire two years after the
   end of their leave year (changed on 15 Oct 2026; the first build used calendar years).
6. **Language:** German interface only. Address users with "du" inside the team app.
7. **Login:** Not everyone has their own email. Known addresses: office@feminin.at,
   ordination@feminin.at (shared), a.tramontana@feminin.at, p.horak@feminin.at
   (personal). So people sign in with a **username** (not email) + password. The TOTP app was
   required at first; the owners switched it off on 16 Oct 2026 (password only, min. 12 chars).
   An owner creates accounts with `npm run user:add` and hands the start password over
   in person. Email in Cognito only for people with a personal address, so a shared
   mailbox can never reset someone else's password.

## Decisions made while building

- Staff cannot change or delete their own approved entries that started before today
  (it would change "taken" days); only approvers can.
- Approvers may also change their own past entries.
- `POST /api/check` gives the drawer its live summary, so the browser never counts.
- Deleting an entry removes it; the audit log keeps the record (without the note).
  The `withdrawn` status is reserved for Phase 2, when approvers see requests.
- Login page: Cognito managed login (newer version, with the feminin logo), which handles first-time password
  change. The browser uses the code flow with PKCE (web/auth.js).
- Approvers cannot decide their own request; the other owner does (two owners exist).
- Staffing warnings count everyone else's *approved* entries plus the request itself.
  The team view shows two levels: below the minimum now (red) and below once all pending
  requests are approved (outlined).
- A half-day absence counts against staffing for its half; the weaker half decides.
- Emails (SES, optional via `-c mailFrom=`) only go to people with an address in their
  profile, i.e. the owners. They never contain notes. A failed email never fails a request.
- Real staff names never go into this repository (it is public). Dev and test data use
  made-up names.
- Closures are entries with kind `closure`, created by approvers only (/api/closures),
  approved at once. `reason` holds their label. Closure days never count as personal
  vacation days; with `countsAsVacation` each person loses their own working days in them.
- Leave account (rules.balance): person.startDate anchors the leave years (missing →
  settings.plannerStart, 2026-01-01). The full allowance is granted at the start of each
  leave year; overrides in person.allowances are keyed by the leave year's start date.
  person.extraDays (+/-) is added once to the first leave year (e.g. a short period on
  other hours). Days are used oldest first; leftovers expire two years after the end of
  their leave year. The balance shows the current leave year, the rest from earlier years,
  taken, planned (all approved future days), pending and remaining.
- The yearly clean-up first stores person.snapshot (the account at the cutoff), then
  deletes older entries; balances do not change (tested).
- In past years 24 and 31 December were free (stored as closures without vacation). In
  2026 only 24 December is.
- POST /api/import (approvers, dry run by default) takes over an existing plan: person
  start dates/patterns, closures, and entries saved as approved. Duplicates are skipped.
  The import text with real names is never committed.
- The first owner is created with `npm run user:add`; everyone else in Einstellungen. The
  API Lambda may create, enable/disable users and change their group in the user pool.
  People keep an `approver` flag in sync with the Cognito group.
- Calendar feed: `/feed/<32-char token>.ics`, no JWT; CloudFront `/feed/*` → HTTP API
  route without authorizer. Token compared in constant time; owner must be active; any
  failure is a plain 404. Approved entries and closures from the first of last month,
  about 14 months ahead; never notes; owners' substitute shows in the description.
- Exports (`/api/export.ics|csv`) are the caller's own entries and do include notes.
- Retention: a second Lambda (`handler.retention`) runs on 2 January; keeps the current
  year plus two, deletes older entries and audit records.
- Door notices are printed from the browser (`@media print`, #print-area).
- Approvers can enter leave for any active person (`userId` in POST /api/entries and
  /api/check) and mark it `approved: true` ("Ist schon genehmigt"), e.g. to carry over
  leave agreed before the planner existed. Audit action `create-approved`. Staff sending
  another `userId` get 403. In the team view, approvers click a day in a person's row.
- Emails: `-c mailFrom=office@feminin.at` verifies the whole domain in SES with Easy DKIM
  (feminin.at has DMARC p=quarantine and SPF only for Outlook, so unsigned SES mail would
  be quarantined). The 3 DKIM CNAMEs are stack outputs for the domain host. A verified
  domain also lets every feminin.at address receive mail in the SES sandbox.
  POST /api/mail-test (approvers) sends a test mail to the caller's own address.
- Logo (17 Oct 2026): the real feminin logo. Header sign = inline SVG rebuilt from the
  artwork (colour #7F5E4F, var(--logo)), wordmark = web/wordmark.png used as a CSS mask,
  web/logo.png (full logo) on printed notices, web/icon.svg as favicon. The Cognito login
  page gets the logo, favicon and brown main button via CfnManagedLoginBranding (settings
  list only the differences from Cognito's defaults). Cognito wants logos between 1:1 and
  4:1 (width:height), so infra/assets/login-logo.png is the sign and wordmark side by side.
