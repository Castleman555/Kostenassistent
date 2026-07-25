# Änderungsbericht – Kostenassistent Instanzenrisiko v3.3

## 1. Bearbeitete Dateien

### `js/instanzenrisiko-berechnung.js`
- `calculateCredit()`: Abrundung mit `Math.floor()` durch die vorhandene zentrale Funktion `roundCent()` ersetzt.
- `normalizeGroups()`: vollständige Validierung der Personen- und Gruppenzuordnung ergänzt. Fehlende, doppelte oder unbekannte Personen sowie ungültige Gruppen-IDs verhindern die Berechnung.
- `calculatePretrialCosts()`: vorgerichtliche Einigungsgebühr je Vertretungsgruppe ergänzt.
- `calculate()`: eigener Gegenstandswert der vorgerichtlichen Einigungsgebühr wird über die RVG-Tabelle bewertet.
- Rückwärtskompatibler Fallback für ältere Datensätze ohne `creditValueCent` ergänzt.

### `js/instanzenrisiko-ausgabe.js`
- Gruppenspezifische Felder `settlementEnabled`, `settlementValueCent` und `settlementFactor` ergänzt.
- Aktivierung, Bearbeitung, Speicherung und Rücksetzung der vorgerichtlichen Einigungsgebühr ergänzt.
- Vorgerichtliche Gebührenpositionen in die vorgegebene Reihenfolge gebracht.
- In den gerichtlichen Tabellen „sonstige Auslagen“ vor der Auslagenpauschale angeordnet.
- Bestehende gruppenspezifische Datenstruktur beibehalten und nur erweitert.

### `js/instanzenrisiko-ui.js`
- Formularvalidierung der Vertretungsgruppen erweitert.
- Fehlende, doppelte oder unbekannte Personen sowie ungültige Gruppen-IDs werden als eindeutige Fehler ausgegeben und verhindern die Weiterleitung zur Berechnung.

### `js/instanzenrisiko-tests.js`
- Tests für Rundungen unter, genau bei und über 0,5 Cent ergänzt.
- Tests für Begrenzung auf 0,75 und auf die tatsächlich entstandene Verfahrensgebühr ergänzt.
- Tests für aktivierte und deaktivierte vorgerichtliche Einigungsgebühr ergänzt.
- Tests für fehlende, doppelte und unbekannte Personen in Vertretungsgruppen ergänzt.

### `DOKUMENTATION_INSTANZENRISIKO.md`
- reguläre Gerichtsgebühr der ersten Instanz von 1,0 auf 3,0 berichtigt.
- klargestellt, dass eine Ermäßigung einen gesetzlichen Ermäßigungstatbestand voraussetzt.

### `index.html`
- neue reguläre Startdatei im Hauptverzeichnis ergänzt.
- Startseitenstruktur aus der vorhandenen Kostenassistent-Startseite übernommen; keine Inline-Skripte oder Inline-Styles ergänzt.

## 2. Fachliche Änderungen

- Kaufmännische Cent-Rundung der Anrechnung.
- Vorgerichtliche Einigungsgebühr mit eigener Aktivierung, eigenem Gegenstandswert und Faktor je Vertretungsgruppe.
- Einbeziehung der Einigungsgebühr in Gebührenzwischensumme, Auslagenpauschale, Umsatzsteuer und Gesamtbetrag.
- Strikte Vollständigkeitsprüfung der Vertretungsgruppen.
- Bestehende gruppenspezifische Speicherung und Berechnung bleiben erhalten und wurden erweitert.
- Ältere gespeicherte Fälle ohne die neuen Felder werden mit fachlichen Standardwerten geladen.

## 3. Ausgeführte Tests

- Syntaxprüfung aller JavaScript-Dateien mit `node --check`: erfolgreich.
- JSON-Validierung beider Gebührentabellen: erfolgreich.
- Automatisierte Berechnungstests aus `js/instanzenrisiko-tests.js`: erfolgreich.
- Zusätzliche Grenzwerttests für die Anrechnung: erfolgreich.
- Tests der vorgerichtlichen Einigungsgebühr: erfolgreich.
- Tests ungültiger und gültiger Vertretungsgruppen: erfolgreich.
- Aufruf über lokalen HTTP-Server:
  - `/`: HTTP 200
  - `/index.html`: HTTP 200
  - Start- und Ausgabeseite: HTTP 200
  - CSS-, JavaScript- und JSON-Ressourcen: HTTP 200
- Prüfung auf Inline-Styles und HTML-Eventhandler: keine neuen Verstöße festgestellt.

## 4. Technisch notwendige Abweichungen

Keine technisch zwingende Abweichung vom Umsetzungsauftrag.

## 5. Verbleibende Einschränkungen

Eine automatisierte visuelle Prüfung sämtlicher responsiver Ansichten und Fokusdarstellungen in mehreren realen Browsern war in der Ausführungsumgebung nicht verfügbar. Struktur, gemeinsame CSS-Nutzung, Dateipfade, Syntax und fachliche Berechnungslogik wurden geprüft.
