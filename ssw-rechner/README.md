# SSW-Rechner feminin

Eine eigene kleine Website für das Team. Sie hilft, den richtigen Termin für eine
Schwangere zu finden:

1. Geburtstermin oder ersten Tag der letzten Regel eingeben
2. Untersuchungen wählen: Eltern-Kind-Pass (EKP 1–5, Allgemein- & familienmedizinische
   Untersuchung + Gesundheitsgespräch, Hebammenberatung 1 und 2) und Ultraschall
   (Ersttrimesterscreening, Organscreening, 3D-Ultraschall, Wachstumsultraschall)
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

Zeiträume festgelegt von der Praxis (28.10.2026). EKP-Termine und der 3D-Ultraschall
haben nur einen möglichen Zeitraum. EKP 1–5 wie in der Excel FEMININ_SSW-RECHNER.xlsx.

| Untersuchung | möglich | bevorzugt |
|---|---|---|
| EKP 1 (Labor, Influenza-Impfung) | 0+0 bis 15+6 | – |
| Allgemein- & familienmedizinische Untersuchung + Gesundheitsgespräch | 13+0 bis 19+6 | – |
| Hebammenberatung 1 | 13+0 bis 19+6 | – |
| EKP 2 | 16+0 bis 19+6 | – |
| Hebammenberatung 2 | 23+0 bis 33+6 | – |
| EKP 3 (Labor, OGTT) | 24+0 bis 27+6 | – |
| EKP 4 (Pertussis-Impfung) | 29+0 bis 33+6 | – |
| EKP 5 (RSV-Impfung) | 34+0 bis 37+6 | – |
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
