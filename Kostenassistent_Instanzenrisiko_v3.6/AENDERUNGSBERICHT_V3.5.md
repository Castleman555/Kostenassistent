# Änderungsbericht Version 3.5

## 1. Grundlage

Verwendet wurden die zuletzt abgestimmten Prompts. Bestehende Funktionen wurden nicht ersetzt, sondern gezielt ergänzt oder korrigiert.

## 2. Bearbeitete Dateien

### `js/instanzenrisiko-ausgabe.js`

- gruppenspezifische Speicherung der Darstellungsposition der Anrechnung ergänzt,
- vorhandene Anrechnungsfelder je Vertretungsgruppe voneinander entkoppelt,
- Migration der bisherigen globalen Darstellungsposition ergänzt,
- gruppenspezifische Rücksetzung der Anrechnung ergänzt,
- Umsatzsteuerobergrenze auf 99 % angepasst,
- ungültige Umsatzsteuereingaben werden auf 19 % zurückgesetzt,
- Berechnung wird nach einer ungültigen Eingabe mit 19 % fortgeführt.

Betroffene Bereiche: `initializeGroupParameters()`, `handleDynamicChange()`, `resetPretrialGroup()`, `commitVatField()`, `renderAttorneyTable()` und `rowWithCheckbox()`.

### `js/instanzenrisiko-berechnung.js`

- gruppenspezifische Darstellungsposition der Anrechnung in der vorgerichtlichen Berechnung berücksichtigt,
- für die I. Instanz werden nur die Anrechnungsbeträge der hierfür ausgewählten Gruppen übergeben,
- doppelte Anrechnung derselben Vertretungsgruppe ausgeschlossen,
- Umsatzsteuerobergrenze von 99 % auch in der Berechnung validiert.

Betroffene Bereiche: `calculatePretrialCosts()`, `calculateInstance()` und `calculateAttorneyCosts()`.

### `js/instanzenrisiko-tests.js`

- Test für unterschiedliche Anrechnungspositionen zweier Vertretungsgruppen ergänzt,
- Test für getrennte Anrechnungsgegenstandswerte ergänzt,
- Test für die Umsatzsteuerobergrenze von 99 % ergänzt,
- Versionsausgabe der Tests auf 3.5 aktualisiert.

### `Instanzenrisiko_Ausgabe.html`

- sichtbare Versionsbezeichnung auf 3.5 aktualisiert.

### `DOKUMENTATION_INSTANZENRISIKO.md`

- gruppenspezifische Darstellungswahl der Anrechnung dokumentiert,
- Validierung und Rücksetzung ungültiger Umsatzsteuersätze dokumentiert,
- Migration älterer Fälle dokumentiert.

## 3. Fachliche Änderungen

Die Berechnung der Anrechnung selbst bleibt unverändert. Weiterhin gelten insbesondere die hälftige Anrechnung, die Begrenzung auf 0,75, die Begrenzung auf die tatsächlich entstandene Verfahrensgebühr, der vorgerichtliche RVG-Rechtsstand und die kaufmännische Rundung.

Neu ist ausschließlich die getrennte Steuerung je Vertretungsgruppe, ob der jeweilige Anrechnungsbetrag vorgerichtlich oder in der I. Instanz ausgewiesen wird. Der Anrechnungsgegenstandswert bleibt je Gruppe unabhängig editierbar.

Die Umsatzsteuer bleibt je Vertretungsgruppe und Kostenbereich getrennt. Ungültige Eingaben werden nun entsprechend dem Auftrag nicht blockierend behandelt, sondern auf 19 % zurückgesetzt und mit diesem Wert berechnet.

## 4. Tests

Erfolgreich ausgeführt:

- Syntaxprüfung aller JavaScript-Dateien,
- Validierung der JSON-Gebührentabellen,
- sämtliche vorhandenen Berechnungstests,
- neue Tests zur gruppenspezifischen Anrechnungsposition,
- neue Tests zur Umsatzsteuerobergrenze,
- Prüfung der relativen HTML-, CSS-, JavaScript- und Datenpfade,
- Testaufruf über einen lokalen HTTP-Server,
- Integritätsprüfung des abschließenden ZIP-Archivs.

## 5. Technisch notwendige Abweichungen

Keine.

## 6. Einschränkungen

Eine automatisierte visuelle Prüfung in mehreren realen Browser-Engines war in der Ausführungsumgebung nicht verfügbar. Syntax, Daten, Berechnungslogik, Pfade und lokaler HTTP-Aufruf wurden geprüft.
