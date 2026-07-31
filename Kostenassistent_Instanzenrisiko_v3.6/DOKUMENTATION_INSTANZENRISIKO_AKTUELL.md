# Instanzenrisiko – aktuelle Soll-Dokumentation

Stand: untersuchter Projektstand im Verzeichnis 3.6. Diese Datei beschreibt den gegenwärtigen, im Quellcode verifizierten Stand. Die Ausgabeseite bezeichnet sich abweichend noch als Version 3.5; diese Inkonsistenz ist unter den offenen Punkten festgehalten. Der chronologische Änderungsverlauf steht in [DOKUMENTATION_INSTANZENRISIKO.md](DOKUMENTATION_INSTANZENRISIKO.md) und ist nicht als aktuelle Spezifikation zu lesen.

## 1. Zweck, Betrieb und Grenzen

Das Modul erfasst einen gerichtlichen Streitwert, Parteien und Vertretungsgruppen und berechnet daraus vorgerichtliche Rechtsanwaltskosten sowie Kosten der I. bis III. Instanz. Es ist eine rein clientseitige Webanwendung ohne Server- oder Benutzerverwaltung.

Voraussetzungen:

- moderner Browser mit `defer`, `Map`, optionaler Verkettung, `structuredClone`, `fetch` und `localStorage`;
- Auslieferung über HTTP(S), weil Gebühren-JSON-Dateien per `fetch` geladen werden;
- JavaScript und lokaler Browserspeicher müssen verfügbar sein.

Lokaler Start im Projektordner:

```bash
python -m http.server 8000
```

Danach `http://localhost:8000/Instanzenrisiko_Startseite.html` öffnen. Ein zuverlässiger Betrieb direkt über `file:///` ist wegen Browserbeschränkungen für `fetch` nicht zugesichert.

Bekannte Grenzen:

- Die Anwendung ersetzt keine zentrale oder revisionssichere Fallverwaltung.
- Clientseitige Validierung ist keine Sicherheitsgrenze gegen manipulierte Daten.
- Werte oberhalb der höchsten Gebührentabellenstufe verwenden den letzten Tabellenwert und erzeugen eine Warnung; es findet keine Extrapolation statt.
- Eine automatisierte visuelle Prüfung aller Zoom- und Browserkombinationen ist im Repository nicht hinterlegt.
- Die vorhandene Testsuite endet derzeit beim bekannten Fehler **„Erste Gruppe vorgerichtlich: 7 %“**. Nachfolgende Tests werden in diesem Lauf nicht mehr ausgeführt.

## 2. Architektur und Datenfluss

```text
Instanzenrisiko_Startseite.html
  → InstanzenrisikoStreitwert (reine Streitwertregeln)
  → InstanzenrisikoForm / Startseiten-UI
  → KostenassistentStorage / localStorage
  → Instanzenrisiko_Ausgabe.html
  → GebuehrentabellenService + InstanzenrisikoBerechnung
  → Ausgabeseiten-UI
```

| Bestandteil | Verantwortung | DOM | Speicher | Öffentlicher Namensraum |
|---|---|---:|---:|---|
| `js/instanzenrisiko-streitwert.js` | Summe, Leerzeilen, Validierung, Speicheraufbereitung | nein | nein | `InstanzenrisikoStreitwert` |
| `js/instanzenrisiko-berechnung.js` | Gebühren-, Gruppen-, Anrechnungs- und Instanzberechnung | nein | nein | `InstanzenrisikoBerechnung` |
| `js/instanzenrisiko-ui.js` | Startformular, Fokus, Tastatur, UI-Zustand, Autospeicherung | ja | ja | `InstanzenrisikoForm` und Kompatibilitätsaliasnamen |
| `js/instanzenrisiko-ausgabe.js` | Ausgabeparameter, Rendering, Rücksetzung, Speicherung des Ausgabezustands | ja | ja | keine stabile Fach-API |
| `js/gebuehrentabellen-service.js` | Laden, Prüfen und Nachschlagen der GKG-/RVG-Tabellen | nein | indirekt per `fetch` | `GebuehrentabellenService` |
| `js/storage.js` | fallbezogene Speicherung | nein | `localStorage` | `KostenassistentStorage` |
| `js/instanzenrisiko-beschriftungen.js` | zentrale sichtbare Beschriftungen | beim Anwenden | nein | `InstanzenrisikoBeschriftungen`, `InstanzenrisikoText` |
| `js/instanzenrisiko-tests.js` | Fach- und Strukturtests | teilweise | nein | `InstanzenrisikoTests` |

Die Fachmodule sind wiederverwendbar, solange ihre Eingabeverträge eingehalten und die benötigten Gebührentabellen übergeben werden. UI-, Fokus- und Speicherfunktionen sind nicht als allgemeine Fachlogik zu verwenden.

## 3. Öffentliche Schnittstellen

Alle Geldwerte der Fach-APIs sind ganzzahlige Centbeträge. Faktoren und Steuersätze sind Dezimalzahlen, beispielsweise `1.3` beziehungsweise `0.19`.

### 3.1 `window.InstanzenrisikoStreitwert`

Der Namensraum ist mit `Object.freeze` eingefroren. Seine Funktionen verändern die übergebenen Positionen nicht.

| Funktion | Eingabe | Ergebnis | Hinweise |
|---|---|---|---|
| `sumPositions(positions)` | Liste mit `betragCent` | Summe in Cent | Nur nicht negative ganzzahlige Centwerte werden addiert; sonstige Werte tragen `0` bei. |
| `isEmptyPosition(position, inputState)` | Position und `{entered, invalid}` | Boolean | Leer nur bei leerer Bezeichnung, `entered === false` und nicht ungültigem Status. |
| `removeEmptyTrailingPositions(positions, inputStates)` | Positionen und `Map` oder Objekt nach ID | neue, neu nummerierte Liste | Entfernt ausschließlich vollständig leere Positionen am Ende. |
| `validatePositions(positions, inputStates)` | Positionen und UI-Eingabestatus | `{valid, errors}` | Fehler besitzen `code`, `field`, `index`, `number` und `message`. |
| `validateStreitwert(streitwert, inputStates)` | Streitwertobjekt und Status | `{valid, errors}` | Prüft den Gesamtbetrag und im Teilwertmodus zusätzlich die Positionen. |
| `prepareForStorage(streitwert, inputStates)` | Streitwertobjekt und Status | speicherfähige Kopie | Entfernt leere Schlusszeilen, nummeriert neu und bildet im Teilwertmodus die Summe neu. |

Beispiel:

```js
const positions = [
  { id: "p1", nummer: 1, bezeichnung: "Klage", betragCent: 100000 }
];
const totalCent = InstanzenrisikoStreitwert.sumPositions(positions);
// 100000 entspricht 1.000,00 EUR
```

Ein fehlender Eingabestatus wird aus Kompatibilitätsgründen als `{ entered: true, invalid: false }` behandelt. Die API wirft für die dokumentierten Validierungsfehler nicht, sondern liefert strukturierte Fehler. Programmierfehler außerhalb dieser Verträge sind nicht gesondert abgefangen.

### 3.2 `window.InstanzenrisikoBerechnung`

Der eingefrorene Namensraum stellt folgende DOM-unabhängige Funktionen bereit:

| Funktion | Zweck und Ergebnis | Wesentliche Fehlerbedingungen |
|---|---|---|
| `roundCent(value)` | Rundet numerisch auf einen ganzzahligen Centwert. | Nicht numerische Werte können `NaN` ergeben. |
| `calculateExpenseAllowance(relevantFeesCent, configuration?)` | 20 %, höchstens 2.000 Cent nach Standardkonfiguration. | Erwartet numerische Gebühren. |
| `calculateRepresentationGroups(party, baseFeeCent, configuration?)` | Normalisiert Gruppen und berechnet Erhöhungsfaktor/-betrag. | `TypeError` bei unvollständiger oder doppelter Personenzuordnung. |
| `calculateCredit(options)` | Liefert `{factor, amountCent}`; der Betrag ist als Abzug negativ. | Deaktivierte oder nicht positive Ausgangswerte ergeben null. |
| `calculateAttorneyCosts(options)` | Berechnet Gebühren je Vertretungsgruppe und Summen. | `TypeError` bei ungültigen Centwerten, Gruppen oder Umsatzsteuer außerhalb 0–99 %. |
| `calculatePretrialCosts(input, feeContext, configuration?)` | Berechnet vorgerichtliche Klägerkosten. | Erwartet normalisierte Partei- und Tabellenkontexte. |
| `calculateCourtCosts(baseFeeCent, factor)` | Liefert Grundgebühr, Faktor und Gerichtskosten. | Keine eigene Wertebereichsvalidierung. |
| `calculateInstance({instance, input, feeTables, configuration})` | Berechnet beide Parteiseiten und Gerichtskosten einer Instanz. | Erwartet vollständig vorbereiteten Berechnungseingang. |
| `calculate(input, feeTables, configuration?)` | Gesamtberechnung einschließlich Metadaten, Warnungen und Zusammenfassung. | `TypeError` bei ungültigem Streitwert, Gruppen oder Umsatzsteuersatz; Tabellen müssen geladen sein. |

`DEFAULT_CONFIGURATION` enthält die Standardfaktoren. Die Konfiguration selbst ist auf oberster Ebene eingefroren; für eine abweichende Nutzung sollte eine eigene vollständige Konfiguration übergeben und nicht die Vorgabe verändert werden.

Minimalbeispiel für eine Teilfunktion:

```js
const court = InstanzenrisikoBerechnung.calculateCourtCosts(10000, 3);
// { baseFeeCent: 10000, factor: 3, amountCent: 30000, totalCent: 30000 }
```

Die komplexen Eingaben von `calculateAttorneyCosts`, `calculatePretrialCosts`, `calculateInstance` und `calculate` sind auf den durch `instanzenrisiko-ausgabe.js` erzeugten Datenvertrag zugeschnitten. Vor externer Verwendung müssen insbesondere Partei-, Gruppen-, Positionswert- und Tabellenstrukturen vollständig bereitgestellt werden.

### 3.3 `window.InstanzenrisikoForm`

Diese API steuert das Startformular und ist daher nicht DOM-unabhängig:

| Funktion | Wirkung |
|---|---|
| `getData()` | Liefert eine tiefe, speicherfähige Kopie; leere Schlusspositionen und UI-Status fehlen darin. |
| `setData(data)` | Übernimmt Daten, nummeriert Positionen neu, bildet Teilwertsumme und Vertreterzahl neu und rendert das Formular; wirft bei Nicht-Objekten `TypeError`. |
| `validate()` | Liefert `{valid, errors}` für Streitwert, Parteien und Gruppenzuordnung. |
| `reset(options?)` | Setzt Formular und optional gespeicherten Modulentwurf zurück. |
| `onChange(callback)` | Registriert einen Rückruf und liefert eine Abmeldefunktion; Nicht-Funktionen führen zu `TypeError`. |
| `saveCurrentDraft(options?)` | Speichert den aktuellen Modulstand; liefert einen Erfolgswert. |
| `restoreSavedDraft()` | Lädt den aktiven Fall, soweit kompatibel. |
| `clearSavedDraft()` | Löscht die Instanzenrisikodaten des aktiven Falls. |
| `initializeDraftStorage()` | Initialisiert aktiven Fall und Wiederherstellung. |

Aus Kompatibilitätsgründen werden dieselben Funktionen zusätzlich einzeln auf `window` veröffentlicht. Neue Aufrufer sollten `InstanzenrisikoForm` verwenden.

## 4. Datenmodelle und Persistenz

### 4.1 Fallcontainer

`KostenassistentStorage` speichert JSON unter Schlüsseln der Form `kostenassistent.fall.<fallId>.v1`. Ein Fall enthält mindestens:

```js
{
  version: 1,
  fallId: "standardfall",
  fallname: "Unbenannter Fall",
  createdAt: "ISO-Zeitpunkt",
  updatedAt: "ISO-Zeitpunkt",
  module: { instanzenrisiko: null /* oder Modulobjekt */ }
}
```

Das Instanzenrisikomodul verwendet `version: 1`, `savedAt`, `data` und optional `ausgabe`. Die Speicherung liegt ausschließlich unverschlüsselt im jeweiligen Browserprofil.

### 4.2 Grunddaten

```js
{
  streitwert: {
    modus: "gesamt" | "teilwerte",
    gesamtCent: 0,
    teilwerte: [
      { id: "stabile-id", nummer: 1, bezeichnung: "Klageantrag Ziff. 1", betragCent: 0 }
    ]
  },
  klaegerseite: Partei,
  beklagtenseite: Partei,
  vorgerichtlicheTaetigkeitKlaeger: false
}
```

Eine `Partei` enthält `anzahlPersonen` (1–99), `vertretungsart`, eine Zuordnung `gruppen: [{person, gruppe}]` und die abgeleitete Zahl `anzahlProzessbevollmaechtigte`. Jede Person muss genau einer gültigen Gruppe zugeordnet sein.

`entered`, `invalid`, Fokusinformationen und die automatisch erzeugte leere Schlusszeile sind UI-Zustand. Sie werden nicht als Teil des Fallmodells gespeichert.

### 4.3 Ausgabezustand

Der Ausgabezustand enthält unter anderem:

- `effectiveDate` und optional `pretrialEffectiveDate`;
- `valueCent`, Umsatzsteuerstandard und vorgerichtliche Aktivierung;
- `termination`, intern für die Vergleichslogik;
- `courtFactors` für I.–III. Instanz;
- positionsbezogene `feeValues` für Kläger/Beklagte und I.–III. Instanz;
- `hearingFactors`, `otherExpenses`, `creditValueCent` und `creditPlacement`;
- `groupParameters.pretrial` sowie `groupParameters.instances` je Instanz, Seite und Gruppe.

Gruppenparameter können individuelle Gegenstandswerte, Geschäfts-/Verfahrens-/Termin-/Einigungsfaktoren, sonstige Auslagen, Umsatzsteuersatz und Anrechnungsposition enthalten. Automatisch berechnete Erhöhungsfaktoren werden nicht als veränderliche Grundlage verwendet. Fehlende Altdaten werden von der Ausgabeseite aus übergeordneten Werten beziehungsweise Standardwerten ergänzt.

## 5. Fachliche Regeln des aktuellen Codes

### 5.1 Tabellen und Rechtsstände

GKG und RVG werden getrennt aus `data/gkg-gebuehrentabellen.json` und `data/rvg-gebuehrentabellen.json` geladen. Unterstützte Stände sind 01.06.2025, 01.01.2021, 01.08.2013 und 01.07.2004. Gewählt wird der jüngste Stand, dessen Beginn nicht nach dem ausgewählten Datum liegt.

### 5.2 Standardfaktoren

| Position | I. Instanz | II. Instanz | III. Instanz |
|---|---:|---:|---:|
| Verfahrensgebühr | 1,3 | 1,6 | 2,3 |
| Terminsgebühr | 1,2 | 1,2 | 1,5 |
| Einigungsgebühr bei aktiviertem Vergleich | 1,0 | 1,3 | 1,3 |
| Gerichtskosten | 3 | 4 | 5 |

Vorgerichtlich gelten standardmäßig Geschäftsgebühr 1,3 und Einigungsgebühr 1,5. Der Erhöhungsfaktor beträgt 0,3 je weiterer Person einer Vertretungsgruppe, höchstens 2,0. Die Auslagenpauschale beträgt 20 % der relevanten Gebühren, höchstens 2.000 Cent.

Die UI erlaubt für Gerichtskosten I. Instanz 1 oder 3, II. Instanz 1–4 und III. Instanz 1, 3 oder 5. Das sind Produktvorgaben des Codes; eine vollständige rechtliche Begründung dieser Auswahl ist im Repository nicht enthalten.

### 5.3 Anrechnung

Die Anrechnung beträgt im Code höchstens die Hälfte der Geschäftsgebühr beziehungsweise Faktor 0,75 einer einfachen Gebühr und ist zusätzlich auf die tatsächlich berechnete Verfahrensgebühr begrenzt. Sie wird als negativer Centbetrag ausgegeben. Je Vertretungsgruppe erscheint sie entweder vorgerichtlich oder auf Klägerseite in der I. Instanz, nicht doppelt und nicht auf Beklagtenseite oder in II./III. Instanz.

### 5.4 Umsatzsteuer und Rundung

Standard sind 19 %; die Fachlogik akzeptiert Werte von 0 bis einschließlich 0,99, also 0–99 %. Die UI unterstützt deutsche Dezimaleingaben. Gebührenpositionen und Summen werden mit `Math.round` auf ganze Cent gerundet. Sonstige Auslagen werden vor der Umsatzsteuer in die Zwischensumme einbezogen.

### 5.5 Instanzgrenzen und Vergleich

- Bei einem Streitwert bis einschließlich 100.000 Cent wird nur die I. Instanz berechnet.
- Bei einem Streitwert bis einschließlich 2.500.000 Cent werden höchstens I. und II. Instanz berechnet.
- Eine aktivierte vorgerichtliche Einigungsgebühr beendet die Instanzberechnung vollständig.
- Ein gerichtlicher Vergleich begrenzt die Berechnung auf die betreffende Instanz und aktiviert deren Einigungsgebühr.

Diese Schwellen und Wirkungen sind im Code verifiziert. Ihre vollständige rechtliche Herleitung ist im Repository nicht belegt und muss fachlich separat geprüft werden.

## 6. Streitwerteingabe und Tastatur

- Im Gesamtmodus ist der Gesamtstreitwert editierbar; Enter bestätigt über das Verlassen des Feldes.
- Die Plus-Schaltfläche wechselt in den Teilwertmodus und übernimmt den vorhandenen Gesamtwert als erste Position.
- Im Teilwertmodus ist der Gesamtwert schreibgeschützt und wird aus gültigen Centbeträgen summiert.
- Enter in „Bezeichnung“ fokussiert „Betrag“ derselben Zeile.
- Enter bei gültiger Bezeichnung und gültigem Betrag erzeugt genau eine neue leere Schlussposition und fokussiert deren Bezeichnung.
- Bei ungültigem Betrag entsteht keine neue Position; das Feld erhält `aria-invalid` und eine zugeordnete Fehlermeldung.
- Eine vollständig leere, automatisch erzeugte Schlussposition bleibt beim Fokussieren leer, wird validierungsseitig ignoriert und vor Speicherung entfernt.
- Eine ausgefüllte Bezeichnung ohne Betrag oder ein Betrag ohne Bezeichnung bleibt fehlerhaft.
- Eine ausdrücklich eingegebene `0` ist ein erfasster Betrag und wird als `0,00 EUR` formatiert; sie ist nicht mit „keine Eingabe“ identisch.
- Tab und Shift+Tab verwenden die native Fokusreihenfolge. Maus und Touch können weiterhin die Schaltflächen verwenden.
- Wird die letzte Position gelöscht, wechselt das Formular in den Gesamtmodus und übernimmt deren Betrag als Gesamtwert.
- „Instanzenrisiko berechnen“ validiert, speichert die Grunddaten, setzt den Ausgabezustand auf Ausgangswerte und navigiert zur Ausgabeseite.

## 7. Responsive Gestaltung und Barrierefreiheit

Die Seiten besitzen Breakpoints unter anderem bei 1.850, 1.450, 1.100, 900, 800/760 und 620 Pixeln. Instanzkarten wechseln von drei über zwei auf eine Spalte; Parteitabellen stehen auf schmalen Ansichten untereinander. Tabellencontainer erlauben horizontales Scrollen. Flexible Breiten, `minmax`, `clamp`, Umbruchregeln und `min-width: 0` begrenzen Überläufe.

Das Umsatzsteuerfeld besitzt eine seitenspezifische Regel mit `width: 100%`, reduzierten Innenabständen und tabellarischen Ziffern. Die statische CSS-Struktur ist responsiv ausgelegt; eine vollständige visuelle Browser-/Zoom-Matrix ist nicht automatisiert nachgewiesen.

Barrierefreiheitsmechanismen:

- semantische Labels und Tabellenüberschriften;
- sichtbare Fokusmarkierung über `:focus-visible`;
- `aria-live` für Statusbereiche;
- `aria-invalid` und `aria-describedby` für ungültige Betragsfelder;
- zugängliche Namen für Symbolschaltflächen;
- Tastaturbedienung ohne absichtliches Formular-Submit bei Enter in Einzelpositionen.

## 8. Tests

`js/instanzenrisiko-tests.js` veröffentlicht `InstanzenrisikoTests.run()`. Nach Laden der benötigten Skripte kann die Suite in der Browserkonsole gestartet werden:

```js
await InstanzenrisikoTests.run();
```

Abgedeckt sind unter anderem:

- Gebühren- und Gerichtskostenfaktoren;
- Tabellenstufen, Rundung und Instanzgrenzen;
- Vertretungsgruppen und Erhöhung;
- Anrechnung und Umsatzsteuerfälle;
- feste beziehungsweise editierbare Faktoren;
- Rücksetz- und Speicherstruktur durch Quelltextverträge;
- direkte DOM-unabhängige Tests der Streitwert-API einschließlich Unveränderlichkeit der Eingaben.

Tastatur- und Fokusabläufe werden derzeit hauptsächlich über Strukturverträge, nicht über einen vollständigen realen Browsertest geprüft. Responsive Aussagen sind statisch aus HTML/CSS abgeleitet, sofern nicht ausdrücklich ein visueller Test protokolliert wird.

Bekannter Fehler: Die Suite schlägt beim Test **„Erste Gruppe vorgerichtlich: 7 %“** fehl. Deshalb darf der Gesamtlauf nicht als vollständig erfolgreich bezeichnet werden. Die Ursache ist in dieser Dokumentationsarbeit nicht untersucht oder verändert worden.

## 9. Sicherheit und Datenschutz

- Falldaten werden als JSON unverschlüsselt in `localStorage` des Browserprofils gespeichert.
- Es gibt keine Authentifizierung, Zugriffstrennung, Verschlüsselung, serverseitige Prüfung oder revisionssichere Historie.
- Personenbezogene oder vertrauliche Falldaten sollten nur auf entsprechend geschützten Geräten und Browserprofilen verarbeitet werden.
- Die Anwendung lädt lokale GKG-/RVG-JSON-Dateien per `fetch`; im untersuchten Modul sind keine externen Analyse-, Werbe- oder Cloud-Dienste eingebunden.
- Dynamische Benutzerdaten werden an mehreren Stellen mit `textContent` oder einer HTML-Escaping-Funktion ausgegeben. Da die Anwendung auch Template-HTML verwendet, muss bei künftigen Erweiterungen jede neue dynamische Einfügung erneut auf Kontext-geeignetes Escaping geprüft werden.
- Beschriftungen werden über `textContent` beziehungsweise kontrollierte Attribute angewendet.
- Manipulierte `localStorage`-Daten können die Clientlogik erreichen. Vor Berechnungen bestehen Validierungen, sie ersetzen jedoch keine Vertrauensgrenze.

## 10. Verifizierte Widersprüche und offene Fragen

1. Die historische Dokumentation nennt an früher Stelle für die Verfahrensgebühr der III. Instanz `1,6`; der aktuelle Code verwendet `2,3`.
2. Historische Abschnitte beschreiben inzwischen entfernte Auswahlfelder zur vollständigen Verfahrensbeendigung. Aktuell wird der Vergleich über Kontrollkästchen an der Einigungsgebühr gesteuert.
3. Die historische Überschrift nennt Version 2.0, während die Datei Änderungen bis Version 3.6 enthält.
4. Projektverzeichnis, Historie und Tests verwenden die Bezeichnung 3.6, während die sichtbare Versionsbeschriftung der Ausgabeseite noch 3.5 lautet. Eine verbindliche zentrale Versionsquelle existiert nicht.
5. Die rechtliche Herleitung der implementierten Streitwertschwellen, Faktor-Auswahllisten und einzelner Vergleichswirkungen ist nicht vollständig im Repository belegt. Diese Punkte sind als implementierte Produktregeln, nicht als Rechtsgutachten dokumentiert.
6. Der bekannte Umsatzsteuer-Testfehler ist offen. Bis zur Ursachenklärung ist nicht belegt, ob Testaufbau, Migration/Fallback oder Berechnung fehlerhaft ist.

## 11. Historie

Der unveränderte chronologische Verlauf befindet sich in [DOKUMENTATION_INSTANZENRISIKO.md](DOKUMENTATION_INSTANZENRISIKO.md). Bei Widersprüchen beschreibt diese aktuelle Soll-Dokumentation den im Code verifizierten Stand; die Historie erklärt lediglich frühere Entwicklungsstände und Entscheidungen.
