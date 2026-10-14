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
- Neue Einträge stehen auf „beantragt“. Das Genehmigen kommt in Phase 2.

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

## Auf AWS veröffentlichen

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

Zugänge anlegen, einmal pro Person:

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

- **Phase 2:** Teamansicht mit Mindestbesetzung (Frontoffice mindestens 2), Anträge
  genehmigen oder ablehnen, E-Mail an die Besitzer:innen
- **Phase 3:** Betriebsurlaub mit Aushang für die Tür, Einstellungen und Personen in der
  App verwalten, Resttage aus dem Vorjahr (verfallen am 31. März), Kalender-Abo für
  Outlook, Google und iPhone, jährliches Löschen alter Daten
