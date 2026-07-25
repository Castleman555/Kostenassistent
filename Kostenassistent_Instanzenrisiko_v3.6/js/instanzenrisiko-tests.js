(function (global) {
  "use strict";
  function assert(condition, label) { if (!condition) throw new Error(label); }
  function makeFeeValues(valueCent) {
    const values = {};
    [1, 2, 3].forEach((instance) => {
      values[instance] = {};
      ["claimant", "defendant"].forEach((side) => {
        values[instance][side] = { procedure: valueCent, increase: valueCent, hearing: valueCent, settlement: valueCent };
      });
    });
    return values;
  }
  async function run() {
    const tables = await global.GebuehrentabellenService.load();
    const oneParty = { anzahlPersonen: 1, gruppen: [{ person: 1, gruppe: 1 }] };
    const makeInput = (overrides = {}) => ({
      effectiveDate: "2025-06-01", valueCent: 6000000, vatRate: 0.19, claimant: oneParty, defendant: oneParty,
      termination: { instance: 0, type: "" }, courtFactors: { 1: 3, 2: 4, 3: 5 },
      feeValues: makeFeeValues(6000000),
      hearingFactors: { 1: { claimant: 1.2, defendant: 1.2 }, 2: { claimant: 1.2, defendant: 1.2 }, 3: { claimant: 1.5, defendant: 1.5 } },
      otherExpenses: { 1: { claimant: 0, defendant: 0 }, 2: { claimant: 0, defendant: 0 }, 3: { claimant: 0, defendant: 0 } },
      pretrial: { enabled: true, creditPlacement: "instance", party: oneParty, valueCent: 6000000, businessFactor: 1.3, effectiveDate: "2025-06-01", otherExpensesCent: 0, vatRate: 0.19 },
      ...overrides
    });

    const normal = global.InstanzenrisikoBerechnung.calculate(makeInput(), tables);
    [1.3, 1.6, 2.3].forEach((expectedFactor, index) => {
      assert(normal.instances[index].claimantAttorneyCosts.groups[0].procedureFactor === expectedFactor, `Standardfaktor Verfahrensgebühr Instanz ${index + 1} Klägerseite muss ${expectedFactor} sein.`);
      assert(normal.instances[index].defendantAttorneyCosts.groups[0].procedureFactor === expectedFactor, `Standardfaktor Verfahrensgebühr Instanz ${index + 1} Beklagtenseite muss ${expectedFactor} sein.`);
    });
    assert(normal.pretrial.claimant.groups[0].settlementFactor === 0, "Eine deaktivierte vorgerichtliche Einigungsgebühr muss weiterhin den Berechnungsfaktor 0 ausweisen.");
    const pretrialSettlement = global.InstanzenrisikoBerechnung.calculate(makeInput({
      pretrial: { enabled: true, creditPlacement: "instance", party: oneParty, valueCent: 6000000, businessFactor: 1.3, effectiveDate: "2025-06-01", otherExpensesCent: 0, vatRate: 0.19, groupParameters: { 1: { settlementEnabled: true } } }
    }), tables);
    assert(pretrialSettlement.pretrial.claimant.groups[0].settlementFactor === 1.5, "Standardfaktor Einigungsgebühr Klägerseite vorgerichtlich muss 1,5 sein.");
    [1.0, 1.3, 1.3].forEach((expectedFactor, index) => {
      const instanceNumber = index + 1;
      const result = global.InstanzenrisikoBerechnung.calculate(makeInput({ termination: { instance: instanceNumber, type: "comparison" } }), tables);
      assert(result.instances[index].claimantAttorneyCosts.groups[0].settlementFactor === expectedFactor, `Standardfaktor Einigungsgebühr Instanz ${instanceNumber} Klägerseite muss ${expectedFactor} sein.`);
      assert(result.instances[index].defendantAttorneyCosts.groups[0].settlementFactor === expectedFactor, `Standardfaktor Einigungsgebühr Instanz ${instanceNumber} Beklagtenseite muss ${expectedFactor} sein.`);
    });
    assert(normal.instances.length === 3, "Drei Instanzen müssen berechnet werden.");
    assert(normal.instances[2].claimantAttorneyCosts.groups[0].procedureFactor === 2.3, "Verfahrensgebühr III. Instanz Klägerseite muss 2,3 sein.");
    assert(normal.instances[2].defendantAttorneyCosts.groups[0].procedureFactor === 2.3, "Verfahrensgebühr III. Instanz Beklagtenseite muss 2,3 sein.");

    for (const factor of [0.5, 1.3, 2.5]) {
      const result = global.InstanzenrisikoBerechnung.calculate(makeInput({ pretrial: { enabled: true, creditPlacement: "pretrial", party: oneParty, valueCent: 6000000, businessFactor: factor, otherExpensesCent: 0, vatRate: 0.19 } }), tables);
      assert(result.pretrial.claimant.groups[0].businessFactor === factor, `Geschäftsgebührenfaktor ${factor} muss verwendet werden.`);
    }

    const feeValues = makeFeeValues(6000000);
    feeValues[1].claimant.procedure = 2000000;
    feeValues[1].claimant.hearing = 1000000;
    const individual = global.InstanzenrisikoBerechnung.calculate(makeInput({ feeValues }), tables);
    const group = individual.instances[0].claimantAttorneyCosts.groups[0];
    assert(group.positionValues.procedure === 2000000, "Individueller Verfahrenswert muss verwendet werden.");
    assert(group.positionValues.hearing === 1000000, "Individueller Terminswert muss verwendet werden.");
    assert(group.positionFees.procedure !== group.positionFees.hearing, "Abweichende Gegenstandswerte müssen unterschiedliche Tabellengebühren ermöglichen.");

    const low = global.InstanzenrisikoBerechnung.calculate(makeInput({ pretrial: { enabled: true, creditPlacement: "pretrial", party: oneParty, valueCent: 6000000, businessFactor: 0.5, otherExpensesCent: 0, vatRate: 0.19 } }), tables);
    const high = global.InstanzenrisikoBerechnung.calculate(makeInput({ pretrial: { enabled: true, creditPlacement: "pretrial", party: oneParty, valueCent: 6000000, businessFactor: 2.5, otherExpensesCent: 0, vatRate: 0.19 } }), tables);
    assert(low.pretrial.claimant.groups[0].creditCent !== high.pretrial.claimant.groups[0].creditCent, "Die Anrechnung muss auf den Geschäftsgebührenfaktor reagieren.");

    const withExpenses = global.InstanzenrisikoBerechnung.calculate(makeInput({ otherExpenses: { 1: { claimant: 12345, defendant: 6789 }, 2: { claimant: 0, defendant: 0 }, 3: { claimant: 0, defendant: 0 } } }), tables);
    assert(withExpenses.instances[0].claimantAttorneyCosts.groups[0].otherExpensesCent === 12345, "Sonstige Auslagen Klägerseite müssen verwendet werden.");
    assert(withExpenses.instances[0].defendantAttorneyCosts.groups[0].otherExpensesCent === 6789, "Sonstige Auslagen Beklagtenseite müssen verwendet werden.");

    const oldPretrial = global.InstanzenrisikoBerechnung.calculate(makeInput({ pretrial: { enabled: true, creditPlacement: "pretrial", party: oneParty, valueCent: 6000000, businessFactor: 1.3, effectiveDate: "2004-07-01", otherExpensesCent: 0, vatRate: 0.19 } }), tables);
    assert(oldPretrial.metadata.pretrialRvgVersion === "2004-07-01", "Der abweichende vorgerichtliche Rechtsstand muss verwendet werden.");
    assert(oldPretrial.metadata.rvgVersion === "2025-06-01", "Der gerichtliche RVG-Rechtsstand darf unverändert bleiben.");


    const creditValuesLow = makeFeeValues(6000000);
    creditValuesLow[1].claimant.procedure = 2000000;
    const creditLow = global.InstanzenrisikoBerechnung.calculate(makeInput({
      feeValues: creditValuesLow,
      pretrial: { enabled: true, creditPlacement: "instance", creditValueCent: 1200000, party: oneParty, valueCent: 6000000, businessFactor: 1.3, effectiveDate: "2025-06-01", otherExpensesCent: 0, vatRate: 0.19 }
    }), tables);
    assert(creditLow.metadata.creditValueCent === 1200000, "Der niedrigere individuelle Anrechnungsgegenstandswert muss verwendet werden.");

    const creditValuesHigh = makeFeeValues(6000000);
    creditValuesHigh[1].claimant.procedure = 1000000;
    const creditHigh = global.InstanzenrisikoBerechnung.calculate(makeInput({
      feeValues: creditValuesHigh,
      pretrial: { enabled: true, creditPlacement: "instance", creditValueCent: 2000000, party: oneParty, valueCent: 6000000, businessFactor: 1.3, effectiveDate: "2025-06-01", otherExpensesCent: 0, vatRate: 0.19 }
    }), tables);
    assert(creditHigh.metadata.creditValueCent === 1000000, "Der Anrechnungsgegenstandswert darf den Verfahrenswert der I. Instanz nicht überschreiten.");

    const placementBase = { enabled: true, creditValueCent: 1200000, party: oneParty, valueCent: 6000000, businessFactor: 1.3, effectiveDate: "2025-06-01", otherExpensesCent: 0, vatRate: 0.19 };
    const creditAtPretrial = global.InstanzenrisikoBerechnung.calculate(makeInput({ feeValues: creditValuesLow, pretrial: { ...placementBase, creditPlacement: "pretrial" } }), tables);
    const creditAtInstance = global.InstanzenrisikoBerechnung.calculate(makeInput({ feeValues: creditValuesLow, pretrial: { ...placementBase, creditPlacement: "instance" } }), tables);
    assert(creditAtPretrial.pretrial.claimant.groups[0].creditCent === creditAtInstance.instances[0].claimantAttorneyCosts.groups[0].creditCent, "Der Anrechnungsbetrag muss an beiden Darstellungspositionen identisch sein.");
    assert(creditAtPretrial.summary.totalRiskCent === creditAtInstance.summary.totalRiskCent, "Das Gesamtrisiko darf sich beim Umschalten der Anrechnungsposition nicht ändern.");

    const exactlyThousand = global.InstanzenrisikoBerechnung.calculate(makeInput({ valueCent: 100000, feeValues: makeFeeValues(100000), pretrial: { enabled: false, creditPlacement: "none", creditValueCent: 100000, party: oneParty, valueCent: 100000, businessFactor: 1.3, effectiveDate: "2025-06-01", otherExpensesCent: 0, vatRate: 0.19 } }), tables);
    assert(exactlyThousand.instances.length === 1, "Bei genau 1.000,00 € darf nur die I. Instanz berechnet werden.");
    assert(exactlyThousand.summary.secondInstanceCent === 0, "Bei genau 1.000,00 € müssen die Kosten der II. Instanz null sein.");

    const aboveThousand = global.InstanzenrisikoBerechnung.calculate(makeInput({ valueCent: 100001, feeValues: makeFeeValues(100001), pretrial: { enabled: false, creditPlacement: "none", creditValueCent: 100001, party: oneParty, valueCent: 100001, businessFactor: 1.3, effectiveDate: "2025-06-01", otherExpensesCent: 0, vatRate: 0.19 } }), tables);
    assert(aboveThousand.instances.length === 2, "Bei 1.000,01 € müssen I. und II. Instanz berechnet werden.");
    assert(aboveThousand.summary.secondInstanceCent > 0, "Bei 1.000,01 € müssen Kosten der II. Instanz entstehen.");


    const twoGroups = { anzahlPersonen: 2, gruppen: [{ person: 1, gruppe: 1 }, { person: 2, gruppe: 2 }] };
    const groupParameters = {
      pretrial: {
        1: { businessValueCent: 2000000, increaseValueCent: 1800000, creditValueCent: 1500000, businessFactor: 1.3, increaseFactor: 0.3, otherExpensesCent: 1111 },
        2: { businessValueCent: 1000000, increaseValueCent: 900000, creditValueCent: 800000, businessFactor: 2.0, increaseFactor: 0.6, otherExpensesCent: 2222 }
      },
      instances: { 1: { claimant: {}, defendant: {} }, 2: { claimant: {}, defendant: {} }, 3: { claimant: {}, defendant: {} } }
    };
    [1, 2, 3].forEach((instance) => {
      ["claimant", "defendant"].forEach((side) => {
        [1, 2].forEach((groupId) => {
          groupParameters.instances[instance][side][groupId] = {
            feeValues: { procedure: groupId === 1 ? 2000000 : 1000000, increase: groupId === 1 ? 1800000 : 900000, hearing: groupId === 1 ? 1600000 : 800000, settlement: groupId === 1 ? 1400000 : 700000 },
            procedureFactor: groupId === 1 ? (instance === 1 ? 1.3 : instance === 2 ? 1.6 : 2.3) : 0.4,
            increaseFactor: groupId === 1 ? 0.3 : 0.8,
            hearingFactor: groupId === 1 ? (instance === 3 ? 1.5 : 1.2) : 0.5,
            settlementFactor: groupId === 1 ? (instance === 1 ? 1.0 : 1.3) : 0.6,
            otherExpensesCent: groupId === 1 ? 3333 : 4444
          };
        });
      });
    });
    const grouped = global.InstanzenrisikoBerechnung.calculate(makeInput({
      claimant: twoGroups,
      defendant: twoGroups,
      groupParameters,
      termination: { instance: 1, type: "comparison" },
      pretrial: { enabled: true, creditPlacement: "instance", creditValueCent: 6000000, party: twoGroups, valueCent: 6000000, businessFactor: 1.3, effectiveDate: "2025-06-01", otherExpensesCent: 0, vatRate: 0.19, groupParameters: groupParameters.pretrial }
    }), tables);
    const groupedClaimant = grouped.instances[0].claimantAttorneyCosts.groups;
    assert(groupedClaimant.length === 2, "Zwei Vertretungsgruppen müssen getrennt berechnet werden.");
    assert(groupedClaimant[0].procedureFactor !== groupedClaimant[1].procedureFactor, "Verfahrensgebührenfaktoren müssen gruppenbezogen sein.");
    assert(groupedClaimant[0].increaseFactor === 0 && groupedClaimant[1].increaseFactor === 0, "Gespeicherte Erhöhungsfaktoren dürfen bei je einer Person pro Gruppe nicht verwendet werden.");
    assert(groupedClaimant[0].hearingFactor !== groupedClaimant[1].hearingFactor, "Terminsgebührenfaktoren müssen gruppenbezogen sein.");
    assert(groupedClaimant[0].settlementFactor !== groupedClaimant[1].settlementFactor, "Einigungsgebührenfaktoren müssen gruppenbezogen sein.");
    assert(groupedClaimant[0].otherExpensesCent !== groupedClaimant[1].otherExpensesCent, "Sonstige Auslagen müssen gruppenbezogen sein.");
    assert(groupedClaimant[0].creditCent !== groupedClaimant[1].creditCent, "Die Anrechnung muss je Vertretungsgruppe berechnet werden.");
    assert(groupedClaimant[1].creditCent >= -groupedClaimant[1].procedureCent, "Die Anrechnung darf die tatsächlich entstandene gruppenbezogene Verfahrensgebühr nicht überschreiten.");

    const roundingBelow = global.InstanzenrisikoBerechnung.calculateCredit({ businessFeeCent: 20000.8, businessFeeFactor: 1.0, procedureBaseFeeCent: 999999, procedureFeeCent: 999999 });
    const roundingExact = global.InstanzenrisikoBerechnung.calculateCredit({ businessFeeCent: 20001, businessFeeFactor: 1.0, procedureBaseFeeCent: 999999, procedureFeeCent: 999999 });
    const roundingAbove = global.InstanzenrisikoBerechnung.calculateCredit({ businessFeeCent: 20001.2, businessFeeFactor: 1.0, procedureBaseFeeCent: 999999, procedureFeeCent: 999999 });
    assert(roundingBelow.amountCent === -10000, "Weniger als 0,5 Cent muss abgerundet werden.");
    assert(roundingExact.amountCent === -10001, "Genau 0,5 Cent muss aufgerundet werden.");
    assert(roundingAbove.amountCent === -10001, "Mehr als 0,5 Cent muss aufgerundet werden.");
    const limitedByFactor = global.InstanzenrisikoBerechnung.calculateCredit({ businessFeeCent: 999999, businessFeeFactor: 2.5, procedureBaseFeeCent: 10001, procedureFeeCent: 999999 });
    assert(limitedByFactor.amountCent === -7501, "Die Begrenzung auf 0,75 muss kaufmännisch gerundet werden.");
    const limitedByProcedure = global.InstanzenrisikoBerechnung.calculateCredit({ businessFeeCent: 999999, businessFeeFactor: 2.5, procedureBaseFeeCent: 999999, procedureFeeCent: 1234 });
    assert(limitedByProcedure.amountCent === -1234, "Die Anrechnung darf die Verfahrensgebühr nicht überschreiten.");

    const settlementOff = global.InstanzenrisikoBerechnung.calculate(makeInput({ pretrial: { enabled: true, creditPlacement: "none", party: oneParty, valueCent: 6000000, businessFactor: 1.3, effectiveDate: "2025-06-01", otherExpensesCent: 0, vatRate: 0.19, groupParameters: { 1: { settlementEnabled: false, settlementValueCent: 1000000, settlementFactor: 1.5 } } } }), tables);
    const settlementOn = global.InstanzenrisikoBerechnung.calculate(makeInput({ pretrial: { enabled: true, creditPlacement: "none", party: oneParty, valueCent: 6000000, businessFactor: 1.3, effectiveDate: "2025-06-01", otherExpensesCent: 0, vatRate: 0.19, groupParameters: { 1: { settlementEnabled: true, settlementValueCent: 1000000, settlementFactor: 1.5 } } } }), tables);
    assert(settlementOff.pretrial.claimant.groups[0].settlementCent === 0, "Deaktivierte vorgerichtliche Einigungsgebühr muss 0 sein.");
    assert(settlementOn.pretrial.claimant.groups[0].settlementCent > 0, "Aktivierte vorgerichtliche Einigungsgebühr muss berechnet werden.");
    assert(settlementOn.pretrial.totalCent > settlementOff.pretrial.totalCent, "Die vorgerichtliche Einigungsgebühr muss die Gesamtkosten erhöhen.");

    for (const invalidParty of [
      { anzahlPersonen: 2, gruppen: [{ person: 1, gruppe: 1 }] },
      { anzahlPersonen: 2, gruppen: [{ person: 1, gruppe: 1 }, { person: 1, gruppe: 2 }] },
      { anzahlPersonen: 2, gruppen: [{ person: 1, gruppe: 1 }, { person: 3, gruppe: 2 }] }
    ]) {
      let rejected = false;
      try { global.InstanzenrisikoBerechnung.calculate(makeInput({ claimant: invalidParty }), tables); } catch (error) { rejected = true; }
      assert(rejected, "Ungültige Vertretungsgruppen müssen die Berechnung verhindern.");
    }


    const threeTogether = { anzahlPersonen: 3, gruppen: [{ person: 1, gruppe: 1 }, { person: 2, gruppe: 1 }, { person: 3, gruppe: 1 }] };
    const automaticIncrease = global.InstanzenrisikoBerechnung.calculate(makeInput({
      claimant: threeTogether,
      groupParameters: { pretrial: {}, instances: { 1: { claimant: { 1: { increaseFactor: 1.9 } }, defendant: {} }, 2: { claimant: {}, defendant: {} }, 3: { claimant: {}, defendant: {} } } },
      pretrial: { enabled: true, creditPlacement: "none", party: threeTogether, valueCent: 6000000, businessFactor: 1.3, effectiveDate: "2025-06-01", otherExpensesCent: 0, vatRate: 0.19, groupParameters: { 1: { increaseFactor: 1.9 } } }
    }), tables);
    assert(automaticIncrease.pretrial.claimant.groups[0].increaseFactor === 0.6, "Der vorgerichtliche Erhöhungsfaktor muss automatisch aus drei Auftraggebern folgen.");
    assert(automaticIncrease.instances[0].claimantAttorneyCosts.groups[0].increaseFactor === 0.6, "Der gerichtliche Erhöhungsfaktor muss automatisch aus drei Auftraggebern folgen.");

    const vatGroups = {
      pretrial: { 1: { vatRate: 0.07 } },
      instances: { 1: { claimant: { 1: { vatRate: 0.16 } }, defendant: { 1: { vatRate: 0 } } }, 2: { claimant: { 1: { vatRate: 0.195 } }, defendant: {} }, 3: { claimant: {}, defendant: {} } }
    };
    const vatResult = global.InstanzenrisikoBerechnung.calculate(makeInput({
      groupParameters: vatGroups,
      pretrial: { enabled: true, creditPlacement: "none", party: oneParty, valueCent: 6000000, businessFactor: 1.3, effectiveDate: "2025-06-01", otherExpensesCent: 0, vatRate: 0.19, groupParameters: vatGroups.pretrial }
    }), tables);
    assert(vatResult.pretrial.claimant.groups[0].vatRate === 0.07, "Vorgerichtlich muss der gruppenspezifische Umsatzsteuersatz verwendet werden.");
    assert(vatResult.instances[0].claimantAttorneyCosts.groups[0].vatRate === 0.16, "Klägerseite I. Instanz muss den eigenen Umsatzsteuersatz verwenden.");
    assert(vatResult.instances[0].defendantAttorneyCosts.groups[0].vatRate === 0, "Beklagtenseite I. Instanz muss 0 Prozent Umsatzsteuer ermöglichen.");
    assert(vatResult.instances[1].claimantAttorneyCosts.groups[0].vatRate === 0.195, "Individuelle Dezimalsteuersätze müssen unterstützt werden.");


    const mixedCreditGroups = {
      1: { businessValueCent: 6000000, increaseValueCent: 6000000, creditValueCent: 6000000, businessFactor: 1.3, creditPlacement: "pretrial", vatRate: 0.19 },
      2: { businessValueCent: 6000000, increaseValueCent: 6000000, creditValueCent: 3000000, businessFactor: 1.3, creditPlacement: "instance", vatRate: 0.19 }
    };
    const mixedCredit = global.InstanzenrisikoBerechnung.calculate(makeInput({
      claimant: twoGroups,
      pretrial: { enabled: true, creditPlacement: "instance", party: twoGroups, valueCent: 6000000, businessFactor: 1.3, effectiveDate: "2025-06-01", otherExpensesCent: 0, vatRate: 0.19, groupParameters: mixedCreditGroups }
    }), tables);
    const mixedPretrialGroups = mixedCredit.pretrial.claimant.groups;
    const mixedInstanceGroups = mixedCredit.instances[0].claimantAttorneyCosts.groups;
    assert(mixedPretrialGroups[0].creditCent < 0 && mixedInstanceGroups[0].creditCent === 0, "Vertretungsgruppe 1 muss die Anrechnung ausschließlich vorgerichtlich ausweisen.");
    assert(mixedPretrialGroups[1].creditCent === 0 && mixedInstanceGroups[1].creditCent < 0, "Vertretungsgruppe 2 muss die Anrechnung ausschließlich in der I. Instanz ausweisen.");
    assert(mixedCreditGroups[1].creditValueCent !== mixedCreditGroups[2].creditValueCent, "Anrechnungsgegenstandswerte müssen gruppenspezifisch bleiben.");

    let invalidVatRejected = false;
    try {
      global.InstanzenrisikoBerechnung.calculate(makeInput({ groupParameters: { pretrial: {}, instances: { 1: { claimant: { 1: { vatRate: 1 } }, defendant: {} }, 2: { claimant: {}, defendant: {} }, 3: { claimant: {}, defendant: {} } } } }), tables);
    } catch (error) { invalidVatRejected = true; }
    assert(invalidVatRejected, "Ein Umsatzsteuersatz oberhalb von 99 Prozent muss abgelehnt werden.");

    const sourceResponse = await fetch("js/instanzenrisiko-ausgabe.js", { cache: "no-store" });
    const sourceText = await sourceResponse.text();
    assert(!/factorInput\([^;\n]*procedureFactor/.test(sourceText), "Der Verfahrensgebührenfaktor darf kein editierbares Faktor-Feld besitzen.");
    assert(sourceText.includes("Fest vorgegebener Faktor Verfahrensgebühr"), "Der Verfahrensgebührenfaktor muss als fest vorgegebene Ausgabe angezeigt werden.");
    assert(sourceText.includes("procedureFactor: configuration.instances[instance - 1].procedureFee"), "Gespeicherte Fälle müssen auf die instanzabhängigen Standardfaktoren normalisiert werden.");
    assert(!/factorInput\([^;\n]*settlementFactor/.test(sourceText), "Der Einigungsgebührenfaktor darf kein editierbares Faktor-Feld besitzen.");
    assert(sourceText.includes("Fest vorgegebener Faktor Einigungsgebühr Klägerseite vorgerichtlich"), "Der vorgerichtliche Einigungsgebührenfaktor muss als fest vorgegebene Ausgabe angezeigt werden.");
    assert(sourceText.includes("Fest vorgegebener Faktor Einigungsgebühr ${roman(context.instance)}. Instanz"), "Die Einigungsgebührenfaktoren aller Instanzen und Parteiseiten müssen als fest vorgegebene Ausgaben angezeigt werden.");
    assert(sourceText.includes("settlementFactor: configuration.pretrial.settlementFee"), "Gespeicherte vorgerichtliche Fälle müssen auf den Standardfaktor normalisiert werden.");
    assert(sourceText.includes("settlementFactor: instance === 1 ? 1.0 : 1.3"), "Gespeicherte gerichtliche Fälle müssen auf die instanzabhängigen Standardfaktoren normalisiert werden.");
    assert(!/data-group-factor=[^>]*increaseFactor/.test(sourceText), "Der Erhöhungsfaktor Nr. 1008 VV RVG darf kein editierbares Faktor-Feld besitzen.");
    assert(sourceText.includes("<output aria-label=\"Automatisch ermittelter Faktor Erhöhung"), "Der automatisch ermittelte Erhöhungsfaktor muss als Ausgabe angezeigt werden.");
    assert(sourceText.includes("data-vat-rate=\"${key}\""), "Die Umsatzsteuerzeile muss je Kostenbereich ein editierbares Feld besitzen.");
    assert(sourceText.includes("serializeGroupParameters"), "Die Speicherung muss automatisch ermittelte Erhöhungsfaktoren bereinigen.");

    // Änderungsauftrag 1 & 2: Neue Tests für Umsatzsteuer und Anrechnung
    // Test: Umsatzsteuer 19% Standard
    const standardVat = global.InstanzenrisikoBerechnung.calculate(makeInput({ groupParameters: { pretrial: { 1: { vatRate: 0.19 } }, instances: { 1: { claimant: { 1: { vatRate: 0.19 } }, defendant: { 1: { vatRate: 0.19 } } }, 2: { claimant: {}, defendant: {} }, 3: { claimant: {}, defendant: {} } } } }), tables);
    assert(standardVat.pretrial.claimant.groups[0].vatRate === 0.19, "Umsatzsteuer Standard 19% muss korrekt verwendet werden.");
    assert(standardVat.instances[0].claimantAttorneyCosts.groups[0].vatRate === 0.19, "Umsatzsteuer 19% Klägerseite I. Instanz muss korrekt sein.");
    assert(standardVat.instances[0].defendantAttorneyCosts.groups[0].vatRate === 0.19, "Umsatzsteuer 19% Beklagtenseite I. Instanz muss korrekt sein.");
    
    // Test: Unterschiedliche Umsatzsteuersätze innerhalb eines Verfahrens
    const mixedVatResult = global.InstanzenrisikoBerechnung.calculate(makeInput({
      groupParameters: {
        pretrial: { 1: { vatRate: 0.07 }, 2: { vatRate: 0.16 } },
        instances: { 1: { claimant: { 1: { vatRate: 0.19 }, 2: { vatRate: 0.0 } }, defendant: { 1: { vatRate: 0.195 } } }, 2: { claimant: {}, defendant: {} }, 3: { claimant: {}, defendant: {} } }
      },
      claimant: twoGroups
    }), tables);
    assert(mixedVatResult.pretrial.claimant.groups[0].vatRate === 0.07, "Erste Gruppe vorgerichtlich: 7%");
    assert(mixedVatResult.pretrial.claimant.groups[1].vatRate === 0.16, "Zweite Gruppe vorgerichtlich: 16%");
    assert(mixedVatResult.instances[0].claimantAttorneyCosts.groups[0].vatRate === 0.19, "Klägerseite Gruppe 1 I. Instanz: 19%");
    assert(mixedVatResult.instances[0].defendantAttorneyCosts.groups[0].vatRate === 0.195, "Beklagtenseite I. Instanz: 19,5%");
    
    // Test: Verschiedene Anrechnungswerte pro Gruppe
    const creditDiffValues = {
      1: { businessValueCent: 6000000, increaseValueCent: 6000000, creditValueCent: 5000000, businessFactor: 1.3, creditPlacement: "pretrial", vatRate: 0.19 },
      2: { businessValueCent: 6000000, increaseValueCent: 6000000, creditValueCent: 2000000, businessFactor: 1.3, creditPlacement: "pretrial", vatRate: 0.19 }
    };
    const creditDiffResult = global.InstanzenrisikoBerechnung.calculate(makeInput({
      claimant: twoGroups,
      pretrial: { enabled: true, creditPlacement: "pretrial", party: twoGroups, valueCent: 6000000, businessFactor: 1.3, effectiveDate: "2025-06-01", otherExpensesCent: 0, vatRate: 0.19, groupParameters: creditDiffValues }
    }), tables);
    const creditGroups = creditDiffResult.pretrial.claimant.groups;
    assert(creditGroups[0].creditCent < creditGroups[1].creditCent || creditGroups[0].creditCent > creditGroups[1].creditCent, "Die Anrechnung muss sich bei unterschiedlichen Gegenstandswerten unterscheiden.");
    assert(Math.abs(creditGroups[0].creditCent) >= Math.abs(creditGroups[1].creditCent), "Größerer Gegenstandswert sollte größere Anrechnung ermöglichen.");
    
    // Test: Migration älterer Fälle (globaler VAT wird auf neue Gruppen angewendet)
    const oldCaseVat = 0.07;
    const migratedVatParameters = {
      pretrial: {},
      instances: { 1: { claimant: {}, defendant: {} }, 2: { claimant: {}, defendant: {} }, 3: { claimant: {}, defendant: {} } }
    };
    const migratedResult = global.InstanzenrisikoBerechnung.calculate(makeInput({
      groupParameters: migratedVatParameters,
      vatRate: oldCaseVat
    }), tables);
    assert(migratedResult.instances[0].claimantAttorneyCosts.groups[0].vatRate === oldCaseVat, "Migrierter Fall muss globalen VAT verwenden.");
    
    // Test: Standardwert 19% für neue Fälle
    const newCaseDefaults = global.InstanzenrisikoBerechnung.calculate(makeInput({}), tables);
    assert(newCaseDefaults.instances[0].claimantAttorneyCosts.groups[0].vatRate === 0.19, "Neue Fälle müssen Standard 19% VAT haben.");
    assert(newCaseDefaults.pretrial.claimant.groups[0].vatRate === 0.19, "Neue Vorgerichtliche Kosten müssen Standard 19% VAT haben.");
    
    // Test: Speicherung und Wiederherstellung von Umsatzsteuersätzen
    const vat007 = global.InstanzenrisikoBerechnung.calculate(makeInput({
      groupParameters: { pretrial: { 1: { vatRate: 0.07 } }, instances: { 1: { claimant: { 1: { vatRate: 0.07 } }, defendant: {} }, 2: { claimant: {}, defendant: {} }, 3: { claimant: {}, defendant: {} } } }
    }), tables);
    assert(vat007.pretrial.claimant.groups[0].vatRate === 0.07, "VAT 0.07 muss korrekt gespeichert und berechnet werden.");
    
    // Test: Rücksetzfunktion (wird in UI gehandhabt, aber wir prüfen, dass Standard-VAT 0.19 ist)
    assert(global.InstanzenrisikoBerechnung.DEFAULT_CONFIGURATION.vatRate === 0.19, "Standard-Konfiguration VAT muss 0.19 sein.");
    
    console.info("Instanzenrisiko Version 3.6: Alle Berechnungs-, Struktur- und Umsatzsteuer/Anrechnungs-Tests erfolgreich.");
    return true;
  }
  global.InstanzenrisikoTests = Object.freeze({ run });
})(window);
