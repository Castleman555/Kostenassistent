# Änderungsbericht Version 3.4

## Bearbeitete Dateien

- `js/instanzenrisiko-ausgabe.js`: nicht editierbare Erhöhungsfaktoren, gruppenspezifische Umsatzsteuerfelder, Validierung, Speicherung, Migration und Rücksetzung.
- `js/instanzenrisiko-berechnung.js`: Erhöhungsfaktor ausschließlich aus Gruppengröße; Umsatzsteuer je Gruppe und Kostenbereich.
- `js/instanzenrisiko-tests.js`: Referenztests für automatische Erhöhung und getrennte Umsatzsteuersätze.
- `DOKUMENTATION_INSTANZENRISIKO.md`: widerspruchsfreie Dokumentation des tatsächlichen Verhaltens.
- `Instanzenrisiko_Startseite.html`, `Instanzenrisiko_Ausgabe.html`: Versionsangabe aktualisiert.

## Fachliche Änderungen

Der Faktor nach Nr. 1008 VV RVG wird für jede Vertretungsgruppe automatisch mit 0,3 je weiterem Auftraggeber, höchstens 2,0, bestimmt. Gespeicherte abweichende Faktoren älterer Fälle werden nicht mehr verwendet.

Der Umsatzsteuersatz wird für jede vorgerichtliche Vertretungsgruppe und für jede Vertretungsgruppe jeder Parteiseite in allen drei Instanzen getrennt gespeichert und berechnet. Der Standardwert ist 19 %, zulässig sind frei eingebbare Werte von 0 % bis 100 %.

## Migration

Vorhandene gruppenspezifische Umsatzsteuersätze werden übernommen. Fehlen sie, wird ein früherer globaler Umsatzsteuersatz übernommen; fehlt auch dieser, wird 19 % verwendet. Andere gespeicherte Werte bleiben unverändert.

## Technisch notwendige Abweichungen

Keine.
