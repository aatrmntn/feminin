# SSW-Rechner feminin

Eine eigene kleine Website für das Team. Sie hilft, den richtigen Termin für eine
Schwangere zu finden:

1. Geburtstermin oder ersten Tag der letzten Regel eingeben
2. Untersuchungen wählen: Ersttrimesterscreening, Organscreening, 3D-Ultraschall,
   Wachstumsultraschall
3. Möglicher und bevorzugter Zeitraum (SSW und Datum, dazu ein Überblick als Balken)
4. Terminvorschläge: Öffnungstage ohne Feiertage und Betriebsurlaub, nie in der Vergangenheit

Es wird nichts gespeichert und nichts verschickt. Alles läuft im Browser. Kein Build,
keine Installation.

## Wo was steht

- `ssw-rules.js`, ganz oben `EXAMS`: die Zeiträume pro Untersuchung (`possible` = möglich,
  `preferred` = bevorzugt), in Tagen ab der letzten Regel, geschrieben als `w(12, 3)` = 12+3.
- `app.js`, ganz oben `OPEN_DAYS` (Öffnungstage) und `CLOSURES` (Betriebsurlaub).

„Möglich“ kommt aus der Excel FEMININ_SSW-RECHNER.xlsx (Blatt „Mutter“). „Bevorzugt“ ist
ein Vorschlag und muss ärztlich geprüft werden.

| Untersuchung | möglich (Excel) | bevorzugt (Vorschlag) |
|---|---|---|
| Ersttrimesterscreening | 12+0 bis 13+3 | 12+2 bis 13+1 |
| Organscreening | 21+0 bis 22+6 | 21+2 bis 22+4 |
| 3D-Ultraschall | 26+0 bis 29+6 | 27+0 bis 28+6 |
| Wachstumsultraschall | 30+0 bis 33+6 | 31+0 bis 32+6 |

## Ausprobieren und prüfen

```bash
cd ssw-rechner
npm run dev    # dann http://localhost:8091 öffnen
npm test       # prüft die Zeiträume gegen die Excel, Feiertage, Vorschläge
```
