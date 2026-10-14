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
5. **Allowance:** 25 days on a 5-day week, scaled for part-time. Unused days carry over
   to the next year and expire on 31 March.
6. **Language:** German interface only. Address users with "du" inside the team app.
7. **Login:** Not everyone has their own email. Known addresses: office@feminin.at,
   ordination@feminin.at (shared), a.tramontana@feminin.at, p.horak@feminin.at
   (personal). So people sign in with a **username** (not email) + password + TOTP app.
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
- Login page: Cognito managed login (newer version), which handles first-time password
  change and authenticator setup. The browser uses the code flow with PKCE (web/auth.js).
- Approvers cannot decide their own request; the other owner does (two owners exist).
- Staffing warnings count everyone else's *approved* entries plus the request itself.
  The team view shows two levels: below the minimum now (red) and below once all pending
  requests are approved (outlined).
- A half-day absence counts against staffing for its half; the weaker half decides.
- Emails (SES, optional via `-c mailFrom=`) only go to people with an address in their
  profile, i.e. the owners. They never contain notes. A failed email never fails a request.
- Real staff names never go into this repository (it is public). Dev and test data use
  made-up names.
