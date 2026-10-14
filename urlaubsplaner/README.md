# Urlaubsplaner feminin

Hier trägt das Team Urlaub und andere Abwesenheiten ein und sieht, wie viele Tage noch
übrig sind. Die zwei Besitzer:innen genehmigen. Es gibt keine Patientendaten und keine
Krankenstände.

Der ganze Plan steht in `PLAN.md`, die Antworten auf die offenen Fragen in `CLAUDE.md`.

## Was schon geht (Phase 1)

- Anmelden mit Benutzername, Passwort und Code-App am Handy
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
   (cd infra && npx cdk bootstrap)
   ```
5. Veröffentlichen (dauert beim ersten Mal etwa 10 Minuten):
   ```bash
   npm run deploy -- -c budgetEmail=a.tramontana@feminin.at
   ```
   Wenn gefragt wird `Do you wish to deploy these changes (y/n)?`, tippst du `y`.
   Ganz am Ende steht `AppUrl = https://….cloudfront.net/`. **Das ist die Adresse des Planers.**
6. Zugänge anlegen: siehe „Zugänge anlegen“ weiter unten.

E-Mails einschalten (freiwillig): beim Veröffentlichen die Absender-Adresse dazuschreiben.
```bash
npm run deploy -- -c budgetEmail=a.tramontana@feminin.at -c mailFrom=office@feminin.at
```
AWS schickt an office@feminin.at eine Mail mit einem Bestätigungslink. Bitte anklicken.
Solange AWS den Mailversand im Testmodus hat („Sandbox“), müssen auch die Empfänger
bestätigt sein: In der AWS-Konsole unter **Amazon SES → Identitäten → Identität erstellen**
die Adressen a.tramontana@feminin.at und p.horak@feminin.at eintragen und die Links in
den Mails anklicken. Wichtig: Immer dieselben `-c …`-Angaben verwenden, sonst werden die
Mails beim nächsten Veröffentlichen wieder ausgeschaltet.

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
(cd infra && npx cdk bootstrap)       # bereitet das Konto für CDK vor
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

Einmal pro Person, im selben Fenster und im Ordner `feminin/urlaubsplaner`:

```bash
npm run user:add -- --username anna --name "Anna" --role frontoffice
npm run user:add -- --username clara --name "Clara" --role frontoffice --pattern mon,tue,thu
npm run user:add -- --username eva --name "Eva" --role backoffice
npm run user:add -- --username tramontana --name "A. Tramontana" --role owner --approver --email a.tramontana@feminin.at
npm run user:add -- --username horak --name "P. Horak" --role owner --approver --email p.horak@feminin.at
```

Das Werkzeug zeigt ein Start-Passwort an. Gib es der Person persönlich. Beim ersten
Anmelden wählt sie ein eigenes Passwort und verbindet eine Authenticator-App, zum Beispiel
Google Authenticator oder Microsoft Authenticator.

Für Personen ohne eigene E-Mail-Adresse gibt es kein „Passwort vergessen“ per Mail.
Die Praxisleitung setzt dann in der AWS-Konsole unter Cognito ein neues Start-Passwort.

## Wo was steht

| Ordner | Inhalt |
|---|---|
| `api/rules.js` | Alle Regeln: Feiertage, Urlaubstage zählen, Prüfungen |
| `api/app.js` | Die Schnittstelle: wer darf was, speichern, Protokoll |
| `api/handler.js`, `api/db-dynamo.js` | Anbindung an AWS Lambda und DynamoDB |
| `web/` | Die Seite im Browser (HTML, CSS, JavaScript, ohne Framework) |
| `infra/` | Bauplan für AWS (CDK) |
| `dev/` | Lokale Testversion mit Daten im Speicher |
| `scripts/add-user.js` | Zugänge anlegen |
| `test/` | Automatische Tests |

## Nächste Schritte

- **Phase 3:** Betriebsurlaub mit Aushang für die Tür, Einstellungen und Personen in der
  App verwalten, Resttage aus dem Vorjahr (verfallen am 31. März), Kalender-Abo für
  Outlook, Google und iPhone, jährliches Löschen alter Daten
