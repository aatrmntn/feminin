# SSW-Rechner feminin

Eine eigene kleine Website für das Team. Sie hilft, den richtigen Termin für eine
Schwangere zu finden:

1. Geburtstermin oder ersten Tag der letzten Regel eingeben
2. Untersuchungen wählen: Ersttrimesterscreening, Organscreening, 3D-Ultraschall,
   Wachstumsultraschall
3. Möglicher und bevorzugter Zeitraum (SSW und Datum, dazu ein Überblick als Balken)
4. Terminvorschläge: Montag bis Freitag ohne Feiertage, nie in der Vergangenheit

Es wird nichts gespeichert und nichts verschickt. Alles läuft im Browser. Kein Build,
keine Installation.

## Wo was steht

- `ssw-rules.js`, ganz oben `EXAMS`: die Zeiträume pro Untersuchung (`possible` = möglich,
  `preferred` = bevorzugt), in Tagen ab der letzten Regel, geschrieben als `w(12, 3)` = 12+3.
- `app.js`, ganz oben `OPEN_DAYS`: die Öffnungstage.

Zeiträume festgelegt von der Praxis (28.10.2026). Nur der bevorzugte Zeitraum beim
3D-Ultraschall ist noch ein Vorschlag und muss ärztlich geprüft werden.

| Untersuchung | möglich | bevorzugt |
|---|---|---|
| Ersttrimesterscreening | 11+0 bis 13+6 | 12+0 bis 13+4 |
| Organscreening | 18+0 bis 23+6 | 21+0 bis 22+4 |
| 3D-Ultraschall | 26+0 bis 29+6 | 27+0 bis 28+6 (Vorschlag) |
| Wachstumsultraschall | 30+0 bis 33+6 | 31+0 bis 32+4 |

## Ausprobieren und prüfen

```bash
cd ssw-rechner
npm run dev    # dann http://localhost:8091 öffnen
npm test       # prüft die Zeiträume gegen die Excel, Feiertage, Vorschläge
```
