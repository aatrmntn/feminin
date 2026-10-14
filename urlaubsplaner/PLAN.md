# Plan: Holiday Planner for a Medical Practice

This plan is for Claude Code. The answers to the open questions (§0) are in `CLAUDE.md`.

It is based on a Holiday Planner that already runs in production for a company intranet.
That app works well, so this plan keeps its rules (how days are counted, who sees what,
the calendar feed) and adds what a practice needs: approvals, minimum staffing, practice
closures and part-time work patterns. It runs on AWS because the practice already has an
AWS account.

---

## 0. Open questions (answer before building)

Answered on 2026-10-14, see `CLAUDE.md`.

1. **Country and region.** The plan assumes **Austria** (13 national public holidays, no
   regional ones). In Germany the holidays depend on the Bundesland. Which applies?
2. **Team.** How many people, and in which roles (doctors, assistants, reception,
   cleaning, trainees)? Who approves leave: one owner or several doctors?
3. **Minimum staffing.** How many people of each role must be in on an opening day?
4. **Opening days.** Which weekdays is the practice open? Is it closed on any afternoons?
5. **Allowance.** 25 days per year on a 5-day week (the Austrian 5 weeks), or something
   else? Can days carry over to next year, and until when?
6. **Language.** German interface, English, or both?
7. **Login.** Does everyone have their own email address? (Needed to sign in.)

---

## 1. What the app does

### For every team member
- A **year view** and a **month view** of their own calendar. Drag across days to book.
- Book **vacation** (counts against the allowance) or **other absence** that counts
  nothing: training/CME, conference, school (trainees), other.
- **Half days** (morning or afternoon) for one-day entries.
- A **private note** on each entry that only they (and approvers) see.
- A **balance** box: allowance, taken, planned, remaining, pending approval.
- A **team view**: everyone in rows, days in columns, one month at a time, with a top
  row that shows how many people are away per day and marks days below minimum staffing.
- **Export**: download `.ics` and CSV, and a personal **calendar subscription link** that
  works in Outlook, Google Calendar and iPhone, showing the team's absences.

### For approvers (owner / doctors)
- An **inbox of pending requests**, with a warning next to any request that would drop a
  day below minimum staffing. Approve or decline with an optional comment.
- **Practice closures**: mark days when the whole practice is closed (for example
  between Christmas and New Year). Closures can count as vacation for everyone, with a
  setting to choose this per closure.
- **Substitute doctor** field on doctors' absences and closures, plus a printable
  notice for the door and website ("Ordination geschlossen von ... bis ...;
  Vertretung: ...").
- Set each person's **allowance**, **carry-over** and **work pattern**.

### Deliberately out of scope for v1
- **No patient data of any kind.** The app knows staff, dates and absence types only.
- **No sick leave.** Sickness data about employees is health data (special category
  under GDPR). Leave it to payroll. If the practice wants it later, see Phase 4.
- No payroll export, no shift rostering, no integration with the practice software.

---

## 2. Rules (the logic that must be right)

These come from the existing app. Put them in one module (`rules.js`) with unit tests.
The server is the only place that counts; the browser shows what the server returns.

1. **Dates are plain ISO days** (`YYYY-MM-DD`) handled as UTC midnight. "Today" is
   computed in the practice's time zone (`Europe/Vienna`).
2. **Public holidays (Austria)**, computed per year; Easter by the anonymous Gregorian
   algorithm:
   New Year (1 Jan), Epiphany (6 Jan), Easter Monday (Easter +1), Labour Day (1 May),
   Ascension (Easter +39), Whit Monday (Easter +50), Corpus Christi (Easter +60),
   Assumption (15 Aug), National Day (26 Oct), All Saints (1 Nov), Immaculate
   Conception (8 Dec), Christmas (25 Dec), St Stephen's (26 Dec).
   Good Friday, 24 Dec and 31 Dec are **not** public holidays.
3. **A vacation day is a day in the person's work pattern** that is not a public holiday
   and not a practice closure day. Each person has a pattern, e.g. Mon, Tue, Thu.
   A half day counts 0.5.
4. **Allowance is in the person's own days.** Default: 25 days for a 5-day week,
   scaled for part-time (4-day week → 20 days). Approvers can override it per year, in
   half days, 0–60. Carry-over is a separate number per year.
5. **An entry spanning New Year** is split per year when counting.
6. **Taken vs planned**: days before today are "taken", today and later are "planned".
   Pending requests show separately and do not count as taken or planned.
7. **Other absence** (training, conference, school) counts nothing against the allowance
   but does count against minimum staffing.
8. **Validation**, with clear messages:
   - end date not before start date; dates between 2020 and 2040;
   - one entry spans at most 92 days;
   - a half day starts and ends on the same date;
   - vacation that covers only non-working days is rejected ("nothing to book");
   - note up to 300 characters, name up to 80;
   - **no overlap with the person's own entries**, except a morning and an afternoon
     half day on the same date.
9. **Minimum staffing** is checked per opening day and role. A request that breaks it is
   still allowed but shows a warning to the requester and the approver.
10. **Approval states**: `pending` → `approved` or `declined`; the owner of an entry can
    withdraw it. Changing the dates of an approved entry sets it back to `pending`.
    Other-absence entries can be set to "no approval needed" in the settings.

---

## 3. Privacy and access

| Who | Sees | Can change |
|---|---|---|
| Team member | Own entries with notes and balance; everyone's names, dates, type and status | Own entries only |
| Approver | Everything, incl. notes and balances | Approve/decline, closures, allowances, work patterns, people |
| Calendar feed | Names, dates, type of approved entries (last month, next 13 months) | Nothing |

- The **user id always comes from the verified login token**, never from the request body.
- **Someone else's entry returns 404**, the same as a missing one, so ids cannot be probed.
- **Every API endpoint checks permissions itself.** Hiding a button is not security.
- **Optimistic concurrency**: every entry has a `rev` number; an update sends the rev it
  started from and gets a 409 "changed in the meantime, reload" if it is out of date.
- **Audit log**, append-only: who created, changed, approved, declined, deleted what and
  when. Never log notes or feed tokens.
- **Calendar feed link** (`/feed/<token>.ics`): calendar apps fetch without a login, so
  the random 32-character token *is* the credential. Shown only to its owner, replaceable
  (the old link dies at once) and removable. Each fetch re-checks that the owner still
  has an active account; any failure answers a plain 404. Compare tokens in constant
  time. Events are "free/transparent" so they never block the subscriber's calendar.
  Half days are 08:00–12:00 or 13:00–17:00 local time; whole days are all-day events.
- Escape all user text in the browser. No raw HTML anywhere.
- Strict Content Security Policy; no third-party scripts at runtime.

GDPR: this is employee data. Keep everything in the EU region (see §4), write a short
entry for the practice's processing records (Verarbeitungsverzeichnis): purpose "leave
planning", data "name, email, absence dates and type", retention "current year plus two
years", then delete older entries with a yearly job.

---

## 4. Architecture on AWS

| Part | Service | Notes |
|---|---|---|
| Region | **eu-central-1 (Frankfurt)** | Everything here, for GDPR |
| Web page | **S3 + CloudFront** | Plain HTML, CSS, JavaScript. No framework needed |
| Login | **Amazon Cognito** user pool | Invite-only (admin creates users), **MFA on** (TOTP app). Hosted login page |
| API | **API Gateway (HTTP API) + one Lambda (Node.js 22)** | JWT authorizer from Cognito. One handler with routes |
| Data | **DynamoDB**, on-demand | Conditional writes for `rev` |
| Feed | Same Lambda, route `/feed/{token}.ics` **without** the JWT authorizer | Token checked in code |
| Audit | DynamoDB table `audit` (append-only) | |
| Email (optional) | **Amazon SES** | "New request" to approvers, "approved/declined" to requester |
| Backups | DynamoDB point-in-time recovery **on** | |
| Infrastructure | **AWS CDK (TypeScript)** | Everything as code, one `deploy` command |

Groups in Cognito: `staff`, `approver`. Role and work pattern live in the app's own
`people` data, not in Cognito.

### Data model (DynamoDB)

```
people   PK: userId (Cognito sub)
         username, email, name, role, active, workPattern: ["mon","tue","thu"],
         allowances: { "2026": 25 }, carryOver: { "2026": 3 },
         feed: { token, createdAt, lastFetchedAt }, updatedAt

entries  PK: id (uuid)   GSI byUser: userId + start   GSI byYear: startYear + start
         userId, kind: vacation|absence|closure, reason, start, end, half: ""|am|pm,
         note, status: pending|approved|declined|withdrawn, decidedBy, decidedAt,
         decisionComment, substitute, countsAsVacation (closures), rev,
         createdAt, updatedAt

settings single item: practiceName, openDays, minimumStaffing: { frontoffice: 2 },
         defaultAllowance, absenceNeedsApproval, timeZone, country
```

An entry spans at most 92 days, so an entry that touches year Y starts in Y or Y-1:
query `byYear` for both and drop what ends before 1 January of Y.

### API

```
GET    /api/overview?year=2026        page data for the caller
GET    /api/entries/{id}
POST   /api/entries                   { kind, reason, start, end, half, note }
POST   /api/check                     same body; returns days and balance after, no write
PUT    /api/entries/{id}              { ..., expectedRev }
DELETE /api/entries/{id}?rev=N        withdraw / delete own
POST   /api/entries/{id}/decision     approver: { status, comment }
GET    /api/requests                  approver: pending requests with staffing warnings
PUT    /api/people/{userId}           approver: role, pattern, allowance, carry-over
PUT    /api/me                        own display name
PUT    /api/me/feed                   create or replace the feed link
DELETE /api/me/feed
PUT    /api/settings                  approver
GET    /feed/{token}.ics              anonymous, token-checked
```

Responses: `{ item }` or `{ error }` with a message a person can act on.
`Cache-Control: no-store` on API responses.

---

## 5. Screens

1. **My calendar**: header with name, balance boxes, year/month switch, calendar with
   colours (vacation, half day, other absence, pending as striped, public holiday,
   closure, weekend / non-working day), list of own entries, export menu.
2. **Team**: month timeline with a row per person grouped by role, a "away today / this
   week" strip, staffing row that turns red below the minimum, filter by name or role.
3. **Requests** (approvers only): pending list, staffing warning, approve / decline.
4. **Settings** (approvers only): people (invite, role, pattern, allowance, carry-over,
   deactivate), practice closures, minimum staffing, opening days.
5. **Entry drawer**: type, reason, from/to, full or half day, note, live summary
   ("3 vacation days, 19 left after this"), staffing warning, save / delete.

Design: calm and readable, works on a phone (reception checks it at the desk), keyboard
accessible, visible focus, no horizontal scrolling except inside the team timeline.

---

## 6. Build phases

**Phase 1: Core (own calendar)**
- Project skeleton, CDK stack, Cognito, DynamoDB, Lambda, static page.
- Rules module with unit tests (holidays 2024–2030, Easter dates, counting with
  patterns, half days, New Year split, validation, overlap).
- Book, change, delete own entries; balance; year and month views.
- *Done when:* a test user can sign in with MFA, book a half day and a week, and the
  balance is correct.

**Phase 2: Team and approvals**
- Team view, staffing row and warnings, approval flow, requests inbox, email via SES.
- Permission tests: a user cannot read another's note or change another's entry (404);
  a non-approver cannot approve (403); stale `rev` gives 409.

**Phase 3: Practice features and export**
- Closures with substitute doctor and printable notice; settings screen; people
  management; carry-over (incl. expiry on 31 March).
- `.ics` download, CSV, calendar subscription feed (fold at 75 octets, CRLF line
  endings, VTIMEZONE for Europe/Vienna).
- Yearly retention job (EventBridge schedule → Lambda).

**Phase 4 (optional, later)**
- Sick leave as a plain "unplanned absence" visible to approvers only, with no reason
  field. Only after checking with the practice's data protection advisor.
- "Ask the planner" assistant on Amazon Bedrock (EU region, never send notes), with two
  tools that call the same API as the page (`list_absences`, `check_request`), always as
  the signed-in user.

---

## 9. Checklist before the practice uses it

- [ ] Public holiday list checked against the official calendar for this and next year
- [ ] MFA enforced for all users; approver accounts tested
- [ ] A staff member cannot see another's note (try it by editing the request in the browser)
- [ ] Backups (point-in-time recovery) on; restore tried once
- [ ] Processing-records entry written; staff informed what is stored and who sees it
- [ ] AWS budget alarm set (e.g. €10/month) so surprises get noticed
- [ ] Doctors: check what your health-insurance contracts require when the practice
      closes (notice periods, substitute) and that the printable notice covers it
