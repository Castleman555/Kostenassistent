# Änderungsbericht Version 3.6

## Bearbeitete Dateien

### js/instanzenrisiko-ausgabe.js
- Speicherung der Gruppenparameter um eine Bereinigung automatisch ermittelter Erhöhungsfaktoren ergänzt.
- `increaseFactor` wird nicht mehr als veränderlicher gruppenspezifischer UI-Wert initialisiert, zurückgesetzt oder gespeichert.
- Bestehende nicht editierbare Anzeige des Faktors nach Nr. 1008 VV RVG und die gruppenspezifischen Umsatzsteuer- und Anrechnungsfelder wurden beibehalten.

### js/instanzenrisiko-tests.js
- Strukturtests ergänzt, die sicherstellen, dass kein editierbares Faktor-Feld für Nr. 1008 VV RVG vorhanden ist.
- Strukturtests für die nicht editierbare Faktoranzeige, die Umsatzsteuerfelder und die bereinigte Speicherung ergänzt.
- Versionsausgabe der Tests auf 3.6 aktualisiert.

### DOKUMENTATION_INSTANZENRISIKO.md
- Tatsächlichen Speicher-, Migrations- und Berechnungsstand für Nr. 1008 VV RVG, Umsatzsteuer und gruppenspezifische Anrechnung dokumentiert.

## Fachliche Änderungen

- Der Erhöhungsfaktor nach Nr. 1008 VV RVG wird ausschließlich aus der Gruppengröße berechnet und nicht als editierbarer oder dauerhaft maßgeblicher Parameter gespeichert.
- Umsatzsteuersätze bleiben je Vertretungsgruppe und Kostenbereich unabhängig.
- Anrechnungsgegenstandswert und Darstellungsposition bleiben je Kläger-Vertretungsgruppe unabhängig.

## Tests

- JavaScript-Syntaxprüfung sämtlicher JavaScript-Dateien: erfolgreich.
- Bestehende Berechnungstests: erfolgreich.
- Neue Strukturtests zu Nr. 1008 VV RVG, Umsatzsteuer und Speicherung: erfolgreich.
- JSON-Validierung der Gebührentabellen: erfolgreich.
- Prüfung der relativen Ressourcenpfade über einen lokalen Webserver: erfolgreich.
- ZIP-Integritätsprüfung: erfolgreich.

## Technisch bzw. fachlich notwendige Abweichung

Der frühere Prompt nennt bei der gruppenspezifischen Anrechnung auch Beklagtenseite sowie II. und III. Instanz. Dies wurde nicht umgesetzt, weil die hier erfasste Anrechnung einer vorgerichtlichen Geschäftsgebühr fachlich nur bei den vorgerichtlichen Kosten oder auf die Verfahrensgebühr der Klägerseite in der I. Instanz angewandt und dargestellt wird. Eine Ausdehnung auf Beklagtenseite oder Rechtsmittelinstanzen würde die bestehende fachliche Berechnungslogik verfälschen.
