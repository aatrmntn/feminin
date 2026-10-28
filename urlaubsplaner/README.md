# Urlaubsplaner feminin

Hier trägt das Team Urlaub und andere Abwesenheiten ein und sieht, wie viele Tage noch
übrig sind. Die zwei Besitzer:innen genehmigen. Es gibt keine Patientendaten und keine
Krankenstände.

**Live:** <https://d2ubta4o04syzz.cloudfront.net/> (nur mit Anmeldung)

Der ganze Plan steht in `PLAN.md`, die Antworten auf die offenen Fragen in `CLAUDE.md`.

## Was schon geht (Phase 1)

- Anmelden mit Benutzername und Passwort
- Eigener Kalender als Jahres- oder Monatsansicht, mit Feiertagen in Österreich
- Urlaub oder andere Abwesenheit eintragen: Fortbildung, Kongress, Berufsschule, Sonstiges.
  Auch halbe Tage. Im Kalender auf einen Tag klicken oder mit der Maus über mehrere Tage ziehen.
- Beim Eintragen siehst du sofort: „3 Urlaubstage. Danach bleiben dir 19 Tage.“
- Urlaubskonto mit Anspruch, genommen, geplant, beantragt und übrig
- Teilzeit: Wer z. B. nur Mo, Di, Do arbeitet, hat 15 statt 25 Tage, und nur diese Tage zählen
- Neue Einträge stehen auf „beantragt“, bis die Praxisleitung sie bestätigt.

## Neu in Phase 2

- **Team:** ein Monat als Tabelle, alle Personen untereinander, nach Bereich sortiert.
  Oben die Zeile „Frontoffice da“: rot, wenn weniger als 2 da sind, rot umrandet, wenn es
  zu wenig wären, sobald alle offenen Anträge bestätigt werden. Dazu „Heute weg“ und
  „Diese Woche weg“, eine Suche nach Namen und ein Filter nach Bereich.
  Notizen sieht man hier nie.
- **Warnung beim Eintragen:** „Achtung: Am 16. November wäre im Frontoffice nur 1 Person da.“
  Eintragen geht trotzdem, die Praxisleitung sieht den Hinweis.
- **Anträge** (nur für die Besitzer:innen): alle offenen Anträge mit Notiz und Warnung,
  Bestätigen oder Ablehnen mit Kommentar. Den eigenen Antrag bestätigt die andere Person.
- **E-Mail:** Bei einem neuen Antrag bekommen die Besitzer:innen eine Mail, ohne Notiz.
  Das Frontoffice hat keine eigenen Adressen und sieht die Entscheidung im Planer.

## Neu in Phase 3

- **Betriebsurlaub** (Einstellungen): Tage, an denen die ganze Ordination zu ist, z. B.
  Weihnachten. Wahlweise „zählt als Urlaub“: Dann wird allen an ihren Arbeitstagen Urlaub
  abgezogen. Mit Vertretung und einem **Aushang zum Ausdrucken** für Tür und Website.
- **Vertretung** auch bei Abwesenheiten der Besitzer:innen, mit eigenem Aushang.
- **Einstellungen:** Personen anlegen, bearbeiten, deaktivieren; Arbeitstage,
  Urlaubsanspruch, Resttage aus dem Vorjahr (mit Vorschlag), Öffnungstage,
  Mindestbesetzung, ob Fortbildungen bestätigt werden müssen.
- **Resttage** aus dem Vorjahr werden zuerst verbraucht und verfallen am 31. März.
- **Mitnehmen:** eigene Einträge als Kalenderdatei (.ics) oder Excel-Tabelle (.csv), und
  ein **Kalender-Abo** fürs Handy (iPhone, Google, Outlook) mit allen bestätigten
  Abwesenheiten im Team, ohne Notizen. Der Link lässt sich jederzeit erneuern oder löschen.
- **Aufräumen:** Jedes Jahr am 2. Jänner werden Einträge gelöscht, die älter als das
  laufende Jahr plus zwei Jahre sind (Datenschutz).

## Selbst ausprobieren, ohne AWS

```bash
cd urlaubsplaner
npm install
npm run dev
```

Dann <http://localhost:8080> öffnen und eine Person aus dem Team auswählen. Das ist eine
Testversion mit erfundenen Daten. Nach einem Neustart ist alles wieder wie am Anfang.

## Tests

```bash
npm test
```

Die Tests prüfen alle Regeln: Feiertage 2024–2030, Ostern, Teilzeit, halbe Tage,
Urlaub über Neujahr, Überschneidungen und wer was sehen darf.

## Auf AWS veröffentlichen, ganz einfach im Browser (CloudShell)

Du brauchst nur den Zugang zum AWS-Konto der Praxis. Installieren musst du nichts.

1. Melde dich unter <https://console.aws.amazon.com> an.
2. Stell oben rechts die Region auf **Europa (Frankfurt) eu-central-1**.
3. Klick oben in der Leiste auf das Symbol **CloudShell** (ein kleines Fenster mit `>_`).
   Unten öffnet sich ein schwarzes Fenster. Dort tippst oder kopierst du die Befehle hinein
   und drückst jeweils Enter.
4. Einmal am Anfang:
   ```bash
   git clone https://github.com/aatrmntn/feminin.git
   cd feminin/urlaubsplaner
   npm install
   npm run bootstrap
   ```
5. Veröffentlichen (dauert beim ersten Mal etwa 10 Minuten):
   ```bash
   npm run deploy -- -c budgetEmail=a.tramontana@feminin.at
   ```
   Wenn gefragt wird `Do you wish to deploy these changes (y/n)?`, tippst du `y`.
   Ganz am Ende steht `AppUrl = https://….cloudfront.net/`. **Das ist die Adresse des Planers.**
6. Zugänge anlegen: siehe „Zugänge anlegen“ weiter unten.

E-Mails einschalten (freiwillig, schickt bei jedem neuen Antrag eine Mail an die Besitzer:innen):
```bash
npm run deploy -- -c budgetEmail=a.tramontana@feminin.at -c mailFrom=office@feminin.at
```
Am Ende stehen 3 Zeilen `MailDnsRecord1` bis `3`. Diese 3 **CNAME-Einträge** muss der Webhoster
von feminin.at in die DNS-Einstellungen eintragen. Damit erlaubt feminin.at dem Mail-Dienst
von AWS, im Namen von feminin.at zu senden; sonst landen die Mails wegen der DMARC-Regel von
feminin.at im Spam. Das Freischalten dauert danach bis zu 72 Stunden. Dann im Planer unter
Einstellungen → Ordination auf „Test-E-Mail an mich senden“ klicken.
Wichtig: Ab dann immer mit `-c mailFrom=office@feminin.at` veröffentlichen, sonst werden die
Mails wieder ausgeschaltet.

Bei einer neuen Version später nur noch:
```bash
cd feminin/urlaubsplaner && git pull && npm install
npm run deploy -- -c budgetEmail=a.tramontana@feminin.at -c mailFrom=office@feminin.at
```

## Auf AWS veröffentlichen, vom eigenen Computer

Das macht eine Person mit Zugang zum AWS-Konto der Praxis, einmal am Anfang und danach
bei jeder neuen Version. Alles läuft in Frankfurt (eu-central-1).

Einmalig vorbereiten:

```bash
cd urlaubsplaner
npm install
aws sso login                     # oder ein anderes AWS-Profil
npm run bootstrap                 # bereitet das Konto für CDK vor
```

Veröffentlichen (prüft vorher alle Tests):

```bash
npm run deploy
# optional mit Kostenwarnung ab 8 USD im Monat:
npm run deploy -- -c budgetEmail=a.tramontana@feminin.at
```

Am Ende steht die Adresse der App (`AppUrl`), z. B. `https://d1234abcd.cloudfront.net/`.
Falls die Login-Adresse `feminin-urlaub` schon vergeben ist: `-c domainPrefix=feminin-urlaub-2`.

## Zugänge anlegen

**Nur den ersten Zugang** (deinen eigenen) legst du im CloudShell-Fenster an, im Ordner
`feminin/urlaubsplaner`:

```bash
npm run user:add -- --username tramontana --name "A. Tramontana" --role owner --approver --email a.tramontana@feminin.at
```

Alle anderen legst du danach direkt im Planer an: **Einstellungen → Team → + Person
hinzufügen**. Das geht auch mit dem Befehl oben (`--role frontoffice`, `backoffice` oder
`owner`, Teilzeit mit z. B. `--pattern mon,tue,wed,thu`).

Der Planer oder das Werkzeug zeigt ein Start-Passwort an. Gib es der Person persönlich. Beim ersten
Anmelden wählt sie ein eigenes Passwort (mindestens 12 Zeichen, mit Groß- und
Kleinbuchstaben und einer Zahl). Eine Code-App am Handy braucht es nicht.

Für Personen ohne eigene E-Mail-Adresse gibt es kein „Passwort vergessen“ per Mail.
Die Praxisleitung setzt dann in der AWS-Konsole unter Cognito ein neues Start-Passwort.

## Wo was steht

| Ordner | Inhalt |
|---|---|
| `api/rules.js` | Alle Regeln: Feiertage, Urlaubstage zählen, Prüfungen |
| `api/app.js` | Die Schnittstelle: wer darf was, speichern, Protokoll |
| `api/handler.js`, `api/db-dynamo.js` | Anbindung an AWS Lambda und DynamoDB |
| `api/ical.js`, `api/csv.js` | Kalenderdatei und Excel-Tabelle |
| `api/mail.js`, `api/directory-cognito.js` | E-Mail (SES) und Login-System (Cognito) |
| `web/` | Die Seite im Browser (HTML, CSS, JavaScript, ohne Framework) |
| `infra/` | Bauplan für AWS (CDK) |
| `dev/` | Lokale Testversion mit Daten im Speicher |
| `scripts/add-user.js` | Zugänge anlegen |
| `test/` | Automatische Tests |

## Später vielleicht (Phase 4)

- Krankenstände, nur nach Rücksprache mit der Datenschutzberatung
- Ein Assistent, den man fragen kann: „Wer ist in der Woche nach Ostern weg?“
