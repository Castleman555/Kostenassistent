# Dokumentation Instanzenrisiko – historischer Änderungsverlauf

> **Hinweis:** Diese Datei enthält historische, teilweise überholte Entwicklungsstände. Die konsolidierte Beschreibung des aktuell im Code verifizierten Sollstands steht in [DOKUMENTATION_INSTANZENRISIKO_AKTUELL.md](DOKUMENTATION_INSTANZENRISIKO_AKTUELL.md). Bei Widersprüchen ist die aktuelle Soll-Dokumentation maßgeblich; eine fachlich-rechtliche Prüfung bleibt davon unberührt.

## Projektstruktur

- `Instanzenrisiko_Startseite.html`: Erfassung und fallbezogene Speicherung der Grunddaten.
- `Instanzenrisiko_Ausgabe.html`: Variable Berechnung und Darstellung des Kostenrisikos.
- `js/instanzenrisiko-berechnung.js`: Reine, DOM-unabhängige Fachlogik.
- `js/instanzenrisiko-ausgabe.js`: Ereignisse, Eingabeparameter und Darstellung.
- `js/gebuehrentabellen-service.js`: Laden, Validieren und Nachschlagen der Gebührentabellen.
- `data/gkg-gebuehrentabellen.json`: GKG-Tabellen für vier Rechtsstände.
- `data/rvg-gebuehrentabellen.json`: RVG-Tabellen für vier Rechtsstände.

## Excel-Quellen

Verwendete Arbeitsblätter der Datei `Kostentool_V01.xlsx`:

- `Instanzenrisiko`
- `UebersichtInstanzenrisiko`
- `Variablen`
- `GKG20250601`, `GKG20210101`, `GKG20130801`, `GKG20040701`
- `RVG20250601`, `RVG20210101`, `RVG20130801`, `RVG20040701`

Aus den acht Gebührenblättern wurden ausschließlich die numerischen Werte der Spalten E und F ab Zeile 3 übernommen. Spalte E ist die obere Wertgrenze, Spalte F die einfache Gebühr. Alle Beträge werden in den JSON-Dateien als Centbeträge gespeichert.

## JSON-Entscheidung

Es werden zwei statt einer oder acht Dateien verwendet. GKG und RVG bleiben fachlich getrennt; die jeweiligen Rechtsstände werden innerhalb derselben Datei versioniert. Damit sind Validierung, Caching und die spätere Ergänzung weiterer Rechtsstände übersichtlich.

## Rechtsstände

- 01.06.2025
- 01.01.2021
- 01.08.2013
- 01.07.2004

Ausgewählt wird der jüngste Rechtsstand, dessen Gültigkeitsbeginn nicht nach dem gewählten Datum liegt.

## Berechnungsfolge

1. Passenden GKG- und RVG-Rechtsstand auswählen.
2. Einfache Gebühr über die erste Wertgrenze ermitteln, die mindestens dem Streitwert entspricht.
3. Vorgerichtliche Kosten berechnen, sofern aktiviert.
4. Rechtsanwaltskosten jeder Vertretungsgruppe getrennt berechnen.
5. Gerichtskosten je Instanz berechnen.
6. Weitere kostenpflichtige Parteien nach ausdrücklicher Eingabe ergänzen.
7. Instanzsummen und kumuliertes Gesamtrisiko bilden.

## Faktoren aus der Arbeitsmappe

- Verfahrensgebühr: I. Instanz 1,3; II. Instanz 1,6; III. Instanz 1,6.
- Terminsgebühr: I. Instanz 1,2; II. Instanz 1,2; III. Instanz 1,5.
- Geschäftsgebühr vorgerichtlich: 1,3.
- Einigungsgebühr vorgerichtlich: 1,5.
- Gerichtskosten: regulär I. Instanz 3,0; II. Instanz 4,0; III. Instanz 5,0. Eine Ermäßigung setzt einen einschlägigen gesetzlichen Ermäßigungstatbestand voraus; sie folgt nicht pauschal aus einer allgemeinen Beendigungsart.
- Kosten aus Vergleichsmehrwert in der I. Instanz: 0,25.
- Erhöhung Nr. 1008 VV RVG: 0,3 je weiterem Auftraggeber, höchstens 2,0.
- Auslagenpauschale: 20 Prozent der maßgeblichen Gebühren, höchstens 20,00 EUR.
- Umsatzsteuer: je Vertretungsgruppe und Kostenbereich standardmäßig 19 Prozent; frei zwischen 0 und 100 Prozent anpassbar.

## Anrechnung

Die Arbeitsmappe stellt die Anrechnung bei den vorgerichtlichen Kosten als negativen Betrag dar. Diese Darstellung wurde übernommen. Die Anrechnung beträgt die Hälfte der Geschäftsgebühr, höchstens 0,75 einer einfachen Gebühr. Bei halben Centbeträgen wird der negative Anrechnungsbetrag centgenau in Richtung null behandelt, damit die nachfolgende Rundung der Excel-Arbeitsmappe für den Referenzfall 60.000 EUR reproduziert wird.

## Rundung

Interne Geldwerte werden in Cent geführt. Fachlich abgeschlossene Positionen und Summen werden auf volle Cent gerundet. Dadurch wird insbesondere die in der Arbeitsmappe ungerundete Anzeige der dritten Instanz (`5.396,8285 EUR`) produktionsgerecht als `5.396,83 EUR` ausgegeben.

## Höchste Tabellenstufe

Die Excel-Formeln verwenden bei einem Wert oberhalb der höchsten Tabellenstufe den letzten vorhandenen Gebührenwert. Dieses Verhalten wurde übernommen, aber mit einer sichtbaren Warnung versehen. Eine Extrapolation findet nicht statt.

## Mehrere Personen und Prozessbevollmächtigte

Die Berechnung erfolgt je Vertretungsgruppe. Jede Gruppe wird als eigener Prozessbevollmächtigter behandelt. Der Erhöhungsfaktor ergibt sich aus `Anzahl Personen der Gruppe - 1`, multipliziert mit 0,3 und begrenzt auf 2,0.

## Weitere Parteien

Weitere kostenpflichtige Parteien werden nur bei ausdrücklicher Eingabe berücksichtigt. Mangels eigener Grunddaten wird für jede weitere Partei zunächst dieselbe Vertretungsstruktur wie auf Beklagtenseite verwendet. Diese Annahme ist in der Berechnungsfunktion isoliert und kann später durch ein eigenes Datenmodell ersetzt werden.

## Lokaler Start

Das Laden externer JSON-Dateien kann bei `file:///`-Adressen durch den Browser blockiert werden. Im Projektordner einen lokalen Server starten:

```bash
python -m http.server 8000
```

Danach öffnen:

```text
http://localhost:8000/Instanzenrisiko_Startseite.html
```

## Tests

`js/instanzenrisiko-tests.js` stellt die Funktion `InstanzenrisikoTests.run()` bereit. Sie kann nach dem Laden der Anwendung in der Browserkonsole aufgerufen werden. Geprüft werden unter anderem der Referenzstreitwert 60.000 EUR, Tabellenstufen, Rechtsstände und die Erhöhung bei mehreren gemeinsam vertretenen Personen.

## Technisch notwendige Abweichungen

1. Die Excel-Arbeitsmappe zeigt einzelne Ergebnisse mit mehr als zwei Nachkommastellen. Die Webanwendung rundet produktionsgerecht auf Cent.
2. JSON-Dateien werden über HTTP geladen. Ein zuverlässiger Direktbetrieb über `file:///` ist wegen Browser-Sicherheitsregeln nicht zugesichert.
3. Die Startdateien mit Uploadzusätzen wie `(2)` wurden im fertigen Projekt unter den verbindlichen Dateinamen `Richterassistent.css` und `Richterassistent_Startseite.html` abgelegt.

## Änderungen Version 2.1 – Änderungsaufträge 1 bis 14

Umgesetzt wurden insbesondere:

- Rechtsstand als Auswahlfeld mit den tatsächlich vorhandenen Tabellenständen 01.06.2025, 01.01.2021, 01.08.2013 und 01.07.2004.
- Umsatzsteuerfelder werden je Vertretungsgruppe sichtbar geführt; der Standardwert beträgt 19 %.
- Steuerung der Einigungsgebühr ausschließlich über „Verfahren vollständig beendet in … durch …“.
- Begrenzung der dritten Instanz auf Streitwerte über 25.000,00 Euro.
- Individuelle anwaltliche Gegenstandswerte je Parteiseite und Instanz.
- Instanzabhängige Auswahlwerte für die Terminsgebühr.
- Anrechnung ausschließlich vorgerichtlich oder in der ersten Instanz auf Klägerseite; doppelte Anrechnung ist ausgeschlossen.
- Aktivierbare vorgerichtliche Rechtsanwaltskosten.
- Vollständige Entfernung der Kosten aus Vergleichsmehrwert in der ersten Instanz.
- Speicherung der neuen Ausgabeeinstellungen im bestehenden Modulobjekt unter `module.instanzenrisiko.ausgabe`.

### Dokumentierte Abweichung

Der Änderungsentwurf nannte zunächst den Rechtsstand 01.01.2022. Die bereitgestellten GKG- und RVG-Daten enthalten jedoch den Rechtsstand 01.01.2021. Deshalb wird technisch zwingend und fachlich datengetreu 01.01.2021 verwendet. Es wurde keine nicht vorhandene Gebührentabelle für 2022 erfunden.

### Gerichtskosten bei Verfahrensbeendigung

Ohne ausgewählte vollständige Verfahrensbeendigung gelten die vorhandenen Standardfaktoren 3,0 / 4,0 / 5,0. Bei den ausdrücklich vorgegebenen Beendigungsfällen werden sie auf 1,0 in der ersten, 2,0 in der zweiten beziehungsweise 3,0 in der dritten Instanz gesetzt. Nachfolgende Instanzen werden weder berechnet noch dargestellt oder summiert.


## Version 2.2 – Änderungsaufträge 15 bis 19

- Die Anrechnung wird bei aktivierten vorgerichtlichen Kosten zwingend genau an einer Stelle geführt. Das Deaktivieren eines Anrechnungsfelds aktiviert automatisch das jeweils andere Feld.
- Die gemeinsamen Eingabefelder oberhalb der Instanzen wurden entfernt.
- Verfahrensgebühr, Erhöhung Nr. 1008 VV RVG, Terminsgebühr und Einigungsgebühr besitzen nun je Instanz und Parteiseite einen eigenen Gegenstandswert.
- Die Terminsgebührenfaktoren werden je Instanz und Parteiseite unmittelbar in der Gebührenzeile ausgewählt.
- Bei Vergleichen beträgt der Einigungsgebührenfaktor in der I. Instanz 1,0 und in der II. sowie III. Instanz 1,3.
- Zur Rückwärtskompatibilität werden gespeicherte gemeinsame Gegenstandswerte und Terminsfaktoren beim ersten Laden in die neue, feinere Struktur übernommen. Die öffentlichen Berechnungsfunktionen bleiben erhalten.

## Version 2.3 – Änderungsaufträge 20 bis 24

- Der Verfahrensgebührenfaktor der III. Instanz wurde für beide Parteiseiten auf 2,3 gesetzt.
- Die vorgerichtliche Geschäftsgebühr besitzt ein Auswahlfeld von 0,5 bis 2,5 in Schritten von 0,1; Standard ist 1,3. Der ausgewählte Faktor wird gespeichert und sowohl für die Geschäftsgebühr als auch für die Anrechnung verwendet.
- Individuelle Gegenstandswerte werden positionsbezogen ausgelesen, validiert, gespeichert und bei der RVG-Tabellenabfrage verwendet. Sie haben Vorrang vor dem allgemeinen Streitwert.
- Jede Instanz besitzt die Schaltfläche „Nur ursprünglicher Streitwert“. Sie setzt ausschließlich die Gegenstandswerte der betreffenden Instanz auf den aktuell gespeicherten Gesamtstreitwert zurück.
- Eine gültige Änderung des gerichtlichen Streitwerts auf der Ausgabeseite setzt `data.streitwert` auf `{ modus: "gesamt", gesamtCent: <Wert>, teilwerte: [] }`. Dadurch wird derselbe Wert auf der Eingabeseite angezeigt und frühere Teilstreitwerte werden gelöscht.
- Individuelle Gegenstandswerte der Gebührenpositionen werden bei einer Änderung des gerichtlichen Streitwerts nicht automatisch überschrieben.

### Technisch zwingende Abweichungen

Keine. Die Änderungen wurden innerhalb der vorhandenen Dateien, öffentlichen Schnittstellen und fallbezogenen Speicherstruktur umgesetzt.


## Version 2.4 – Änderungsaufträge 25 bis 28

- Editierbare Gegenstandswerte und sonstige Auslagen werden nicht mehr während des Tippens verarbeitet. Die Übernahme erfolgt ausschließlich mit Enter oder beim Verlassen des Feldes.
- Der gerichtliche Streitwert verwendet dieselbe Bestätigungslogik. Ungültige Eingaben verändern weder Berechnung noch Falldaten.
- Sonstige Auslagen sind je Instanz und Parteiseite als unabhängige Centbeträge editierbar und werden im bestehenden Ausgabezustand gespeichert.
- Für vorgerichtliche Rechtsanwaltskosten kann ein eigener RVG-Rechtsstand gewählt werden. Die leere Auswahl übernimmt den allgemeinen Rechtsstand. Gerichtskosten und gerichtliche Rechtsanwaltskosten bleiben hiervon unberührt.
- Die möglichen vorgerichtlichen Rechtsstände werden aus dem bereits vorhandenen allgemeinen Rechtsstands-Auswahlfeld abgeleitet; dadurch besteht keine zweite unabhängige Liste.

### Technisch zwingende Abweichungen

Keine. Die vorhandenen Funktionen und öffentlichen Schnittstellen wurden beibehalten und rückwärtskompatibel ergänzt.


## Version 2.5 – Änderungsaufträge 29 und 30

### Vorbelegung individueller Gegenstandswerte

Alle Gegenstandswerte der Gebührenpositionen werden weiterhin zunächst mit dem aktuell gespeicherten gerichtlichen Gesamtstreitwert vorbelegt. Vorhandene gültige individuelle Werte aus dem aktiven Fall haben Vorrang. Ergänzend werden gespeicherte Werte nun auf endliche, nicht negative Centbeträge geprüft; ungültige Altdaten fallen auf den aktuellen gerichtlichen Streitwert zurück. Bestehende bestätigte individuelle Werte werden nicht überschrieben.

### Responsives Layout

Die Ausgabeseite besitzt eine seitenspezifische responsive Gestaltung. Der Inhaltsbereich, die Parameter, Zusammenfassung, Instanzkarten, Parteitabellen, Eingabefelder und Auswahlfelder verwenden flexible Breiten, `minmax()` und `clamp()`. Die Instanzkarten werden abhängig von der verfügbaren Breite in drei, zwei oder einer Spalte angeordnet. Innerhalb breiter Instanzkarten stehen Kläger- und Beklagtenseite nebeneinander; in schmalen Karten werden sie untereinander angeordnet.

Die fachliche Berechnungslogik wurde nicht verändert. Technisch zwingende Abweichungen vom Änderungsauftrag waren nicht erforderlich.

## Version 2.6 – Änderungsauftrag 31

- Ergänzt wurde ein eigenständiger, fallbezogen gespeicherter `creditValueCent` für den Gegenstandswert der Anrechnung.
- Der maßgebliche Anrechnungsgegenstandswert ist das Minimum aus dem individuell bestätigten Anrechnungsgegenstandswert und dem Gegenstandswert der Verfahrensgebühr der Klägerseite in der I. Instanz.
- Die Eingabe wird entsprechend den übrigen Betragsfeldern erst mit Enter oder beim Verlassen des Feldes übernommen.
- Der Anrechnungsbetrag wird einmal zentral anhand des vorgerichtlichen Rechtsstands und Geschäftsgebührenfaktors berechnet und anschließend – abhängig von der bestehenden Auswahl – entweder vorgerichtlich oder in der I. Instanz dargestellt.
- Die Anrechnung ist zusätzlich auf die tatsächlich berechnete Verfahrensgebühr der Klägerseite in der I. Instanz begrenzt.
- Ältere Fälle ohne `creditValueCent` verwenden rückwärtskompatibel den aktuellen gerichtlichen Streitwert als Ausgangswert.
- Technisch zwingende Abweichungen vom Änderungsauftrag waren nicht erforderlich.


## Version 2.7 – Änderungsaufträge 32 bis 34

- Bestätigte Änderungen des übergeordneten gerichtlichen Streitwerts überschreiben sämtliche individuellen Gebührengegenstandswerte und den individuellen Anrechnungsgegenstandswert.
- Änderungen auf der Startseite werden über die bestehende fallbezogene Speicherstruktur auf den Ausgabestand übertragen; ein bloßes Laden überschreibt keine Werte.
- Die instanzbezogene Schaltfläche heißt nun „Werte zurücksetzen“ und setzt Gegenstandswerte, Terminsgebührenfaktoren sowie sonstige Auslagen der betreffenden Instanz auf die definierten Ausgangswerte zurück.
- Die II. Instanz wird nur bei einem gerichtlichen Streitwert über 1.000,00 € angezeigt und berechnet. Die Schwelle der III. Instanz bleibt unverändert.
- Keine technisch zwingenden Abweichungen. Die spezielle Rücksetzregel in Abschnitt 33.2 wurde gegenüber der allgemeineren Aufzählung in Abschnitt 33.5 vorrangig angewendet.

## Version 2.8 – Änderungsaufträge 35 und 36

- Die Schaltfläche „Werte zurücksetzen“ der I. Instanz setzt zusätzlich den gemeinsam verwendeten individuellen Anrechnungsgegenstandswert auf den aktuellen gerichtlichen Streitwert zurück. Dies gilt unabhängig davon, ob die Anrechnung vorgerichtlich oder bei den Rechtsanwaltskosten der Klägerseite in der I. Instanz dargestellt wird.
- Eine bestätigte Änderung des gerichtlichen Streitwerts unter „Berechnungsparameter“ führt nun dieselbe Rücksetzlogik für I., II. und III. Instanz aus. Dabei werden die individuellen Gegenstandswerte, die Terminsgebührenfaktoren, die sonstigen Auslagen sowie der Anrechnungsgegenstandswert der I. Instanz zurückgesetzt.
- Nach der vollständigen Rücksetzung erfolgt genau eine gemeinsame Neuberechnung und Speicherung. Zwischenberechnungen mit teilweise zurückgesetzten Instanzen werden vermieden.
- Technisch zwingende Abweichungen waren nicht erforderlich. Die bestehende Funktion `resetInstanceValues()` wurde ergänzt; zusätzlich bündelt `resetAllInstanceValues()` die bereits vorhandene instanzbezogene Rücksetzlogik.

---

## Version 3.1 – Änderungsaufträge 37 bis 40

### Tabellenstruktur

- Vorgerichtliche Klägerseite: Geschäftsgebühr, Erhöhung Nr. 1008 VV RVG, Anrechnung.
- I. Instanz Klägerseite: Verfahrensgebühr, Erhöhung Nr. 1008 VV RVG, Anrechnung.
- Auf der Beklagtenseite der I. Instanz wird keine Anrechnungszeile mehr erzeugt.

### Anrechnung

Der für die Anrechnung maßgebliche Faktor wird je Vertretungsgruppe aus dem Geschäftsgebührenfaktor und dem Faktor der Erhöhung Nr. 1008 VV RVG gebildet. Die bisherigen Begrenzungen und die gegenseitig ausschließende Darstellungslogik bleiben erhalten.

### Navigation

Die Navigation der Ausgabeseite verwendet dieselbe Struktur und dieselben CSS-Klassen wie die Startseite.

### Gruppenbezogene Parameter

Unter `module.instanzenrisiko.ausgabe.groupParameters` werden für jede Vertretungsgruppe getrennt gespeichert:

- vorgerichtlicher Gegenstandswert und Faktor der Geschäftsgebühr,
- vorgerichtlicher Gegenstandswert und Faktor der Erhöhung,
- Anrechnungsgegenstandswert,
- Gegenstandswerte aller Gebührenpositionen in I. bis III. Instanz,
- Faktoren der Verfahrens-, Termins- und Einigungsgebühr; der Erhöhungsfaktor wird automatisch aus der Gruppengröße ermittelt,
- sonstige Auslagen.

Altfälle ohne `groupParameters` werden aus den bisherigen gemeinsamen Werten initialisiert. Die bisherigen Speicherfelder bleiben aus Gründen der Rückwärtskompatibilität erhalten.

### Rücksetzung

Zusätzlich zur instanzbezogenen Rücksetzung besitzt jede Vertretungsgruppe eine eigene Schaltfläche „Werte zurücksetzen“. Diese verändert ausschließlich die betreffende Gruppe. Die bestehende instanzbezogene Schaltfläche bleibt erhalten und setzt weiterhin sämtliche Gruppen der Instanz zurück.

### Technisch zwingende Abweichungen

Keine.

---

## Version 3.2 – Nachprüfung und Vervollständigung der Änderungsaufträge 37 bis 40

Die Umsetzung wurde erneut unmittelbar auf Basis der bereitgestellten Version 2.8 geprüft und vervollständigt.

### Ergänzende Korrekturen gegenüber der vorherigen Fassung

- Die gruppenbezogene Rücksetzung setzt die editierbaren Werte der Vertretungsgruppe zurück. Der Erhöhungsfaktor wird anschließend automatisch aus der Gruppengröße neu bestimmt; der Umsatzsteuersatz wird auf 19 % gesetzt.
- Auch der vorgerichtliche Erhöhungsfaktor wird beim gruppenbezogenen und vollständigen Zurücksetzen wieder aus der Personenzahl der Gruppe bestimmt.
- Vorgerichtliche sonstige Auslagen sind je Vertretungsgruppe als eigenes Eingabefeld editierbar und werden getrennt gespeichert und berechnet.
- Jede vorgerichtliche Vertretungsgruppe besitzt eine eigene Schaltfläche „Werte zurücksetzen“.
- Die Begrenzung der Anrechnung auf die tatsächlich entstandene Verfahrensgebühr verwendet nun den individuellen Verfahrensgebührenfaktor und Verfahrensgegenstandswert der jeweiligen Vertretungsgruppe.
- Die bestehenden gemeinsamen Speicherfelder bleiben als Rückwärtskompatibilität erhalten. Neue gruppenbezogene Daten werden zusätzlich unter `ausgabe.groupParameters` gespeichert.

### Technisch zwingende Abweichungen

Keine.


## Ergänzung Version 3.4 – mehrere Vertretungsgruppen

- Der Faktor der Erhöhung nach Nr. 1008 VV RVG ist nicht editierbar. Er beträgt 0,3 je weiterem Auftraggeber innerhalb der jeweiligen Vertretungsgruppe, höchstens 2,0.
- Beim Laden älterer Fälle werden gespeicherte abweichende Erhöhungsfaktoren ignoriert und aus der aktuellen Gruppenzuordnung neu berechnet.
- Jede vorgerichtliche und gerichtliche Vertretungsgruppe besitzt einen eigenen Umsatzsteuersatz. Der Standardwert beträgt 19 %.
- Die Eingabe unterstützt 0 %, 7 %, 16 %, 19 % sowie beliebige Werte einschließlich deutscher Dezimalschreibweise. Zulässig sind Werte zwischen 0 % und 100 %.
- Beim Laden älterer Fälle wird ein vorhandener gruppenspezifischer Satz übernommen, ersatzweise ein früherer globaler Satz, andernfalls 19 %.
- Das Zurücksetzen einer Gruppe setzt ausschließlich deren Umsatzsteuersatz auf 19 % zurück.

## Ergänzung Version 3.5 – Umsatzsteuer und gruppenspezifische Anrechnung

- Der Umsatzsteuersatz wird für jede vorgerichtliche und gerichtliche Vertretungsgruppe getrennt gespeichert und berechnet. Der Standardwert beträgt 19 %.
- In der Faktor-Spalte der Umsatzsteuerzeile steht ein Eingabefeld mit Vorschlägen für 0 %, 7 %, 16 % und 19 %. Deutsche Dezimalwerte mit Komma werden unterstützt.
- Zulässig sind Werte von 0 % bis 99 %. Leere, nicht numerische, negative oder höhere Eingaben werden in der Benutzeroberfläche auf 19 % zurückgesetzt; zugleich wird ein verständlicher Hinweis ausgegeben und mit 19 % weitergerechnet.
- Die Auswahl, ob die Anrechnung vorgerichtlich oder in der I. Instanz dargestellt wird, wird nun für jede vorgerichtliche Vertretungsgruppe getrennt gespeichert.
- Bei mehreren Vertretungsgruppen kann deshalb beispielsweise Gruppe 1 vorgerichtlich und Gruppe 2 in der I. Instanz angerechnet werden. Eine doppelte Anrechnung derselben Gruppe bleibt ausgeschlossen.
- Der Gegenstandswert der Anrechnung bleibt je Vertretungsgruppe getrennt editierbar. Änderungen und Rücksetzungen einer Gruppe verändern keine andere Gruppe.
- Ältere Fälle ohne gruppenspezifische Darstellungswahl übernehmen als Ausgangswert die bisherige globale Auswahl; fehlt diese, wird die Anrechnung standardmäßig in der I. Instanz dargestellt.

## Ergänzung Version 3.6 – tatsächliche Umsetzung und Bereinigung

- Der Faktor der Erhöhung nach Nr. 1008 VV RVG wird weiterhin ausschließlich aus der Zahl der Auftraggeber der jeweiligen Vertretungsgruppe berechnet und nur als nicht editierbare Ausgabe dargestellt.
- Automatisch ermittelte Erhöhungsfaktoren werden bei neuen Speicherungen nicht mehr als veränderlicher Gruppenparameter persistiert. Vorhandene Altdatenfelder `increaseFactor` werden beim Laden nicht als Berechnungsgrundlage verwendet und bei der nächsten Speicherung entfernt.
- Die Umsatzsteuer bleibt für jede vorgerichtliche und gerichtliche Vertretungsgruppe sowie jeden Kostenbereich getrennt gespeichert. Der Standardwert beträgt 19 %; gültig sind 0 % bis 99 %, einschließlich deutscher Dezimalwerte.
- Ungültige Umsatzsteuereingaben werden auf 19 % zurückgesetzt und mit einem verständlichen Statushinweis quittiert.
- Anrechnungsgegenstandswert und Darstellungsposition werden je vorgerichtlicher Vertretungsgruppe getrennt gespeichert und berechnet. Die Anrechnung wird fachlich ausschließlich bei den vorgerichtlichen Kosten oder den Rechtsanwaltskosten der Klägerseite in der I. Instanz ausgewiesen; eine Anrechnung auf Beklagtenseite oder in der II./III. Instanz wird nicht erzeugt.
