# SSW-Rechner feminin

Eine eigene kleine Website für das Team. Sie hilft, den richtigen Termin für eine
Schwangere zu finden:

1. Geburtstermin oder ersten Tag der letzten Regel eingeben
2. Untersuchungen wählen: Ersttrimesterscreening, Organscreening, 3D-Ultraschall,
   Wachstumsultraschall
3. Möglicher und bevorzugter Zeitraum auf einen Blick: Datum, SSW und ein Balken mit „heute“

Es wird nichts gespeichert und nichts verschickt. Alles läuft im Browser. Kein Build,
keine Installation.

## Adresse

<https://aatrmntn.github.io/feminin/ssw-rechner/>

Ohne Anmeldung. Die Seite ist nirgends verlinkt und für Suchmaschinen gesperrt
(`noindex`). Weil das Repository öffentlich ist, ist der Link aber nicht wirklich geheim.
Das ist in Ordnung, weil der Rechner keine Daten speichert.

Jede Änderung auf `main` im Ordner `ssw-rechner/` wird automatisch veröffentlicht
(`.github/workflows/ssw-rechner.yml`), aber nur, wenn alle Tests durchlaufen.

Einmalig nötig: Auf GitHub im Repository **Settings → Pages → Build and deployment →
Source: „GitHub Actions“** wählen.

## Wo was steht

- `ssw-rules.js`, ganz oben `EXAMS`: die Zeiträume pro Untersuchung (`possible` = möglich,
  `preferred` = bevorzugt), in Tagen ab der letzten Regel, geschrieben als `w(12, 3)` = 12+3.

Zeiträume festgelegt von der Praxis (28.10.2026). Der 3D-Ultraschall hat nur einen
möglichen Zeitraum, keinen bevorzugten.

| Untersuchung | möglich | bevorzugt |
|---|---|---|
| Ersttrimesterscreening | 11+0 bis 13+6 | 12+0 bis 13+4 |
| Organscreening | 18+0 bis 23+6 | 21+0 bis 22+4 |
| 3D-Ultraschall | 26+0 bis 29+6 | – |
| Wachstumsultraschall | 30+0 bis 33+6 | 31+0 bis 32+4 |

## Ausprobieren und prüfen

```bash
cd ssw-rechner
npm run dev    # dann http://localhost:8091 öffnen
npm test       # prüft die Zeiträume und den Status
```
