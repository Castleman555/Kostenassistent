# Änderungsübersicht – Änderungsaufträge 37 bis 40

Ausgangsbasis: `Kostenassistent_Instanzenrisiko_v2.8(1).zip`

## Bearbeitete Dateien

### `Instanzenrisiko_Ausgabe.html`

- Navigation an die Struktur der Startseite angeglichen.
- Versionshinweis auf Version 3.2 aktualisiert.

### `Richterassistent.css`

- Darstellung der gruppenbezogenen Faktoreingaben ergänzt.
- Responsive Darstellung der gruppenbezogenen Rücksetzschaltflächen ergänzt.

### `js/instanzenrisiko-ausgabe.js`

- Neues, zusätzliches Datenmodell `groupParameters` für vorgerichtliche Kosten sowie I. bis III. Instanz ergänzt.
- Rückwärtskompatible Initialisierung aus den bisherigen gemeinsamen Speicherfeldern ergänzt.
- Eigene Eingabefelder je Vertretungsgruppe für Gegenstandswerte, Gebührenfaktoren und sonstige Auslagen ergänzt.
- Vorgerichtliche Reihenfolge auf Geschäftsgebühr, Erhöhung und Anrechnung geändert.
- Reihenfolge in der I. Instanz Klägerseite auf Verfahrensgebühr, Erhöhung und Anrechnung geändert.
- Anrechnungszeile auf der Beklagtenseite der I. Instanz entfernt.
- Gruppenbezogene Rücksetzschaltflächen vorgerichtlich und je Instanz ergänzt.
- Streitwertänderung setzt alle Gruppenwerte entsprechend der bestehenden Rücksetzlogik zurück.
- Speicherung von `groupParameters` im bestehenden Modulobjekt ergänzt.

### `js/instanzenrisiko-berechnung.js`

- Berechnung sämtlicher Rechtsanwaltsgebühren je Vertretungsgruppe ergänzt.
- Gruppenbezogene Gegenstandswerte und Faktoren für Verfahrens-, Erhöhungs-, Termins- und Einigungsgebühr berücksichtigt.
- Anrechnungsfaktor aus Geschäftsgebührenfaktor plus Erhöhungsfaktor Nr. 1008 VV RVG gebildet.
- Anrechnung je Gruppe anhand des überschneidenden Gegenstandswerts berechnet.
- Begrenzung auf die tatsächlich entstandene gruppenbezogene Verfahrensgebühr umgesetzt.
- Getrennte sonstige Auslagen vorgerichtlich und je Instanz berücksichtigt.

### `js/instanzenrisiko-tests.js`

- Tests für mehrere Vertretungsgruppen mit unterschiedlichen Gegenstandswerten, Faktoren, Auslagen und Anrechnungsbeträgen ergänzt.
- Test der Begrenzung auf die tatsächlich entstandene gruppenbezogene Verfahrensgebühr ergänzt.

### `DOKUMENTATION_INSTANZENRISIKO.md`

- Umsetzung der Änderungsaufträge 37 bis 40 dokumentiert.
- Ergänzende Nachprüfung und Vervollständigung dokumentiert.
- Technisch zwingende Abweichungen: keine.
