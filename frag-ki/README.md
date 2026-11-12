# Frag KI über feminin

Vorschau: https://aatrmntn.github.io/feminin/frag-ki/

Vier vorbereitete Fragen und vier KI-Dienste. ChatGPT, Claude und Perplexity erhalten die Frage per Link. Für Gemini wird die Frage kopiert und anschließend eingefügt. Das Verhalten externer Dienste kann sich ändern; Anmeldung kann nötig sein. Der Text bleibt deshalb jederzeit sichtbar und kopierbar.

## Einbau auf feminin.at

Einmal in der globalen WordPress-Vorlage vor der Fußzeile einen HTML-Bereich einfügen:

```html
<div id="feminin-ki"></div>
<script src="https://aatrmntn.github.io/feminin/frag-ki/widget.js"
        data-target="feminin-ki" defer></script>
```

Alternativ `widget.js` auf feminin.at selbst hosten und die Script-Adresse entsprechend anpassen. Bestehende Cookie- und Inhaltssicherheitsregeln beim Einbau berücksichtigen. Das Skript setzt keine Cookies, speichert keine Eingaben und ruft keine KI-Schnittstelle ab. Erst ein externer Anbieter-Link übergibt den vorbereiteten Text. Kein Freitextfeld für Gesundheitsdaten.

Öffentliche URLs auf feminin.at werden aus dem kanonischen Link, ersatzweise dem aktuellen Seitenlink übernommen. Suchparameter und Fragmente werden entfernt. Auf anderen Domains wird die feminin-Startseite als Quelle verwendet. Gestaltung ist in einem Shadow DOM gekapselt und verändert keine bestehenden WordPress-Stile.

## Grenzen und Suchmaschinen

Der Bereich erleichtert Besucher:innen, Fragen in externen KI-Diensten zu stellen. Er garantiert weder Abruf der Website noch korrekte Antworten, Empfehlungen oder bessere Suchmaschinenplatzierung. Die Auswahl des Anbieters ist keine medizinische Beratung.

Diese Änderung umfasst keine Anpassung von WordPress-Seitentiteln, strukturierten Daten, sitemap.xml, robots.txt oder llms.txt. Diese müssen am tatsächlichen WordPress-System separat geprüft werden. Die Vorschauseite ist mit noindex gekennzeichnet; vorhandene Werkzeuge werden nicht geändert.
