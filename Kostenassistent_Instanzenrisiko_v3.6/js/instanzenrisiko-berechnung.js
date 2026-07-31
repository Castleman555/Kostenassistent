(function (global) {
  "use strict";

  const DEFAULT_CONFIGURATION = Object.freeze({
    vatRate: 0.19,
    expenseRate: 0.20,
    expenseMaximumCent: 2000,
    additionalClientRate: 0.3,
    additionalClientMaximum: 2.0,
    pretrial: { businessFee: 1.3, settlementFee: 1.5 },
    instances: [
      { number: 1, procedureFee: 1.3, hearingFee: 1.2, settlementFee: 1.0, courtFee: 3 },
      { number: 2, procedureFee: 1.6, hearingFee: 1.2, settlementFee: 1.3, courtFee: 4 },
      { number: 3, procedureFee: 2.3, hearingFee: 1.5, settlementFee: 1.3, courtFee: 5 }
    ]
  });

  const roundCent = (value) => Math.round(Number(value) + Number.EPSILON);
  function assertCent(value, name) {
    if (!Number.isInteger(value) || value < 0) throw new TypeError(`${name} muss ein nicht negativer Centbetrag sein.`);
  }
  function calculateExpenseAllowance(relevantFeesCent, configuration = DEFAULT_CONFIGURATION) {
    return Math.min(roundCent(relevantFeesCent * configuration.expenseRate), configuration.expenseMaximumCent);
  }
  function normalizeGroups(party) {
    if (!party || !Number.isInteger(party.anzahlPersonen) || party.anzahlPersonen < 1) {
      throw new TypeError("Die Personenzahl der Partei muss mindestens 1 betragen.");
    }
    const assignments = Array.isArray(party.gruppen) ? party.gruppen : [];
    if (assignments.length === 0 && party.anzahlPersonen === 1) return [{ groupId: 1, persons: 1 }];
    if (assignments.length !== party.anzahlPersonen) {
      throw new TypeError("Jede Person muss genau einer Vertretungsgruppe zugeordnet sein.");
    }
    const persons = new Set();
    const counts = new Map();
    assignments.forEach((entry) => {
      const person = Number.parseInt(entry.person, 10);
      const groupId = Number.parseInt(entry.gruppe, 10);
      if (!Number.isInteger(person) || person < 1 || person > party.anzahlPersonen) {
        throw new TypeError("Die Vertretungsgruppen enthalten eine unbekannte Person.");
      }
      if (persons.has(person)) throw new TypeError(`Person ${person} ist mehrfach einer Vertretungsgruppe zugeordnet.`);
      if (!Number.isInteger(groupId) || groupId < 1 || groupId > party.anzahlPersonen) {
        throw new TypeError(`Die Gruppen-ID für Person ${person} ist ungültig.`);
      }
      persons.add(person);
      counts.set(groupId, (counts.get(groupId) || 0) + 1);
    });
    for (let person = 1; person <= party.anzahlPersonen; person += 1) {
      if (!persons.has(person)) throw new TypeError(`Person ${person} ist keiner Vertretungsgruppe zugeordnet.`);
    }
    return [...counts.entries()].sort((a, b) => a[0] - b[0]).map(([groupId, groupPersons]) => ({ groupId, persons: groupPersons }));
  }
  function groupIncrease(group, configuration) {
    const additionalClients = Math.max(0, group.persons - 1);
    return {
      additionalClients,
      increaseFactor: Math.min(additionalClients * configuration.additionalClientRate, configuration.additionalClientMaximum)
    };
  }
  function calculateRepresentationGroups(party, baseFeeCent, configuration = DEFAULT_CONFIGURATION) {
    return normalizeGroups(party).map((group) => {
      const increase = groupIncrease(group, configuration);
      return { ...group, ...increase, increaseCent: roundCent(baseFeeCent * increase.increaseFactor) };
    });
  }
  function calculateCredit({ businessFeeCent, businessFeeFactor, procedureBaseFeeCent, procedureFeeCent = Number.POSITIVE_INFINITY, enabled = true }) {
    if (!enabled || businessFeeCent <= 0 || businessFeeFactor <= 0) return { factor: 0, amountCent: 0 };
    const factor = Math.min(businessFeeFactor / 2, 0.75);
    const statutoryCreditCent = Math.min(roundCent(businessFeeCent / 2), roundCent(procedureBaseFeeCent * 0.75));
    return { factor, amountCent: -Math.min(statutoryCreditCent, Math.max(0, procedureFeeCent)) };
  }
  function calculateAttorneyCosts(options) {
    const {
      baseFeeCent, valueCent, party, procedureFactor, hearingFactor,
      settlementFactor = 0, settlementEnabled = false, otherExpensesCent = 0,
      vatRate = DEFAULT_CONFIGURATION.vatRate, credit = { factor: 0, amountCent: 0 },
      configuration = DEFAULT_CONFIGURATION, positionFees = null, positionValues = null,
      groupParameters = {}, groupCredits = {}
    } = options;
    assertCent(baseFeeCent, "Einfache Gebühr");
    assertCent(valueCent, "Gegenstandswert");
    const defaultValues = positionValues || { procedure: valueCent, increase: valueCent, hearing: valueCent, settlement: valueCent };
    const defaultFees = positionFees || { procedure: baseFeeCent, increase: baseFeeCent, hearing: baseFeeCent, settlement: baseFeeCent };

    const groups = normalizeGroups(party).map((group) => {
      const parameter = groupParameters[group.groupId] || {};
      const values = parameter.positionValues || defaultValues;
      const fees = parameter.positionFees || defaultFees;
      Object.entries(values).forEach(([key, value]) => assertCent(value, `Gegenstandswert ${key}`));
      const increase = groupIncrease(group, configuration);
      const actualProcedureFactor = Number.isFinite(Number(parameter.procedureFactor)) ? Number(parameter.procedureFactor) : procedureFactor;
      const actualIncreaseFactor = increase.increaseFactor;
      const actualHearingFactor = Number.isFinite(Number(parameter.hearingFactor)) ? Number(parameter.hearingFactor) : hearingFactor;
      const actualSettlementFactor = Number.isFinite(Number(parameter.settlementFactor)) ? Number(parameter.settlementFactor) : settlementFactor;
      const actualOtherExpenses = Number.isInteger(parameter.otherExpensesCent) ? parameter.otherExpensesCent : otherExpensesCent;
      const actualCredit = groupCredits[group.groupId] || credit;
      const procedureCent = roundCent(fees.procedure * actualProcedureFactor);
      const increaseCent = roundCent(fees.increase * actualIncreaseFactor);
      const hearingCent = roundCent(fees.hearing * actualHearingFactor);
      const settlementCent = settlementEnabled ? roundCent(fees.settlement * actualSettlementFactor) : 0;
      const relevantFeesCent = Math.max(0, procedureCent + hearingCent + settlementCent + increaseCent);
      const expenseAllowanceCent = calculateExpenseAllowance(relevantFeesCent, configuration);
      const subtotalCent = roundCent(procedureCent + hearingCent + settlementCent + increaseCent + (actualCredit.amountCent || 0) + expenseAllowanceCent + actualOtherExpenses);
      const actualVatRate = Number.isFinite(Number(parameter.vatRate)) ? Number(parameter.vatRate) : vatRate;
      if (actualVatRate < 0 || actualVatRate > 0.99) throw new TypeError("Der Umsatzsteuersatz muss zwischen 0 und 99 Prozent liegen.");
      const vatCent = roundCent(subtotalCent * actualVatRate);
      return {
        ...group, ...increase, valueCent: values.procedure, baseFeeCent: fees.procedure,
        positionValues: { ...values }, positionFees: { ...fees },
        procedureFactor: actualProcedureFactor, procedureCent, increaseFactor: actualIncreaseFactor, increaseCent,
        hearingFactor: actualHearingFactor, hearingCent,
        settlementFactor: settlementEnabled ? actualSettlementFactor : 0, settlementCent,
        creditFactor: actualCredit.factor || 0, creditCent: actualCredit.amountCent || 0,
        expenseAllowanceCent, otherExpensesCent: actualOtherExpenses, subtotalCent, vatRate: actualVatRate, vatCent,
        totalCent: subtotalCent + vatCent
      };
    });
    return {
      groups,
      subtotalCent: groups.reduce((s, g) => s + g.subtotalCent, 0),
      vatCent: groups.reduce((s, g) => s + g.vatCent, 0),
      totalCent: groups.reduce((s, g) => s + g.totalCent, 0)
    };
  }
  function calculatePretrialCosts(input, feeContext, configuration = DEFAULT_CONFIGURATION) {
    if (!input.enabled) return { enabled: false, claimant: { groups: [], subtotalCent: 0, vatCent: 0, totalCent: 0 }, totalCent: 0 };
    const groups = normalizeGroups(input.party).map((group) => {
      const increase = groupIncrease(group, configuration);
      const parameter = input.groupParameters?.[group.groupId] || {};
      const actualIncreaseFactor = increase.increaseFactor;
      const valueCent = Number.isInteger(parameter.businessValueCent) ? parameter.businessValueCent : input.valueCent;
      const increaseValueCent = Number.isInteger(parameter.increaseValueCent) ? parameter.increaseValueCent : valueCent;
      const businessFactor = Number.isFinite(Number(parameter.businessFactor)) ? Number(parameter.businessFactor) : input.businessFactor;
      const businessBaseFeeCent = feeContext.groups?.[group.groupId]?.businessBaseFeeCent ?? feeContext.rvgFeeCent;
      const increaseBaseFeeCent = feeContext.groups?.[group.groupId]?.increaseBaseFeeCent ?? businessBaseFeeCent;
      const settlementEnabled = Boolean(parameter.settlementEnabled ?? input.settlementEnabled);
      const settlementValueCent = Number.isInteger(parameter.settlementValueCent) ? parameter.settlementValueCent : valueCent;
      const settlementFactor = Number.isFinite(Number(parameter.settlementFactor)) ? Number(parameter.settlementFactor) : (input.settlementFactor ?? configuration.pretrial.settlementFee);
      const settlementBaseFeeCent = feeContext.groups?.[group.groupId]?.settlementBaseFeeCent ?? businessBaseFeeCent;
      const businessCent = roundCent(businessBaseFeeCent * businessFactor);
      const increaseCent = roundCent(increaseBaseFeeCent * actualIncreaseFactor);
      const settlementCent = settlementEnabled ? roundCent(settlementBaseFeeCent * settlementFactor) : 0;
      const groupCredit = feeContext.groups?.[group.groupId]?.credit || feeContext.credit || { factor: 0, amountCent: 0 };
      const creditPlacement = parameter.creditPlacement === "pretrial" || parameter.creditPlacement === "instance" ? parameter.creditPlacement : input.creditPlacement;
      const credit = creditPlacement === "pretrial" ? groupCredit : { factor: 0, amountCent: 0 };
      const relevantFeesCent = businessCent + increaseCent + settlementCent;
      const expenseAllowanceCent = calculateExpenseAllowance(relevantFeesCent, configuration);
      const otherExpensesCent = Number.isInteger(parameter.otherExpensesCent) ? parameter.otherExpensesCent : input.otherExpensesCent;
      const subtotalCent = roundCent(relevantFeesCent + credit.amountCent + expenseAllowanceCent + otherExpensesCent);
      const actualVatRate = Number.isFinite(Number(parameter.vatRate)) ? Number(parameter.vatRate) : input.vatRate;
      if (actualVatRate < 0 || actualVatRate > 0.99) throw new TypeError("Der Umsatzsteuersatz muss zwischen 0 und 99 Prozent liegen.");
      const vatCent = roundCent(subtotalCent * actualVatRate);
      return { ...group, ...increase, increaseFactor: actualIncreaseFactor, creditPlacement, valueCent, increaseValueCent, settlementEnabled, settlementValueCent, baseFeeCent: businessBaseFeeCent, businessFactor, businessCent, increaseCent, creditFactor: credit.factor, creditCent: credit.amountCent, settlementFactor: settlementEnabled ? settlementFactor : 0, settlementCent, expenseAllowanceCent, otherExpensesCent, subtotalCent, vatRate: actualVatRate, vatCent, totalCent: subtotalCent + vatCent };
    });
    const claimant = { groups, subtotalCent: groups.reduce((s, g) => s + g.subtotalCent, 0), vatCent: groups.reduce((s, g) => s + g.vatCent, 0), totalCent: groups.reduce((s, g) => s + g.totalCent, 0) };
    return { enabled: true, claimant, totalCent: claimant.totalCent };
  }
  function calculateCourtCosts(baseFeeCent, factor) {
    return { baseFeeCent, factor, amountCent: roundCent(baseFeeCent * factor), totalCent: roundCent(baseFeeCent * factor) };
  }
  function lookupFee(feeTables, type, effectiveDate, valueCent) {
    const service = global.GebuehrentabellenService;
    const version = service.selectVersion(feeTables[type], effectiveDate);
    return { version, lookup: service.findFeeByValue(version.entries, valueCent) };
  }
  function lookupPositionFees(feeTables, effectiveDate, values) {
    const result = {};
    const warnings = [];
    Object.entries(values).forEach(([key, valueCent]) => {
      const fee = lookupFee(feeTables, "RVG", effectiveDate, valueCent);
      result[key] = fee.lookup.feeCent;
      warnings.push(fee.lookup.exceededMaximum);
    });
    return { fees: result, exceededMaximum: warnings.some(Boolean) };
  }
  function buildGroupAttorneyParameters(party, defaults, savedGroups, feeTables, effectiveDate) {
    let exceededMaximum = false;
    const parameters = {};
    normalizeGroups(party).forEach((group) => {
      const saved = savedGroups?.[group.groupId] || {};
      const positionValues = { ...defaults, ...(saved.feeValues || {}) };
      const lookup = lookupPositionFees(feeTables, effectiveDate, positionValues);
      exceededMaximum ||= lookup.exceededMaximum;
      parameters[group.groupId] = {
        positionValues,
        positionFees: lookup.fees,
        procedureFactor: saved.procedureFactor,
        hearingFactor: saved.hearingFactor,
        settlementFactor: saved.settlementFactor,
        otherExpensesCent: saved.otherExpensesCent,
        vatRate: saved.vatRate,
        creditPlacement: saved.creditPlacement
      };
    });
    return { parameters, exceededMaximum };
  }
  function calculateInstance({ instance, input, feeTables, configuration }) {
    const number = instance.number;
    const claimantValues = input.feeValues[number].claimant;
    const defendantValues = input.feeValues[number].defendant;
    const claimantGroups = buildGroupAttorneyParameters(input.claimant, claimantValues, input.groupParameters?.instances?.[number]?.claimant, feeTables, input.effectiveDate);
    const defendantGroups = buildGroupAttorneyParameters(input.defendant, defendantValues, input.groupParameters?.instances?.[number]?.defendant, feeTables, input.effectiveDate);
    const claimantPositionFees = lookupPositionFees(feeTables, input.effectiveDate, claimantValues);
    const defendantPositionFees = lookupPositionFees(feeTables, input.effectiveDate, defendantValues);
    const settlementEnabled = input.termination.instance === number && input.termination.type === "comparison";
    const settlementFactor = number === 1 ? 1.0 : 1.3;
    const claimantAttorneyCosts = calculateAttorneyCosts({
      baseFeeCent: claimantPositionFees.fees.procedure, valueCent: claimantValues.procedure,
      positionValues: claimantValues, positionFees: claimantPositionFees.fees, party: input.claimant,
      procedureFactor: instance.procedureFee, hearingFactor: input.hearingFactors[number].claimant,
      settlementFactor, settlementEnabled, vatRate: input.vatRate,
      groupCredits: number === 1 && input.pretrial.enabled
        ? Object.fromEntries(Object.entries(input.groupCredits || {}).filter(([groupId]) => {
            const placement = input.pretrial.groupParameters?.[groupId]?.creditPlacement || input.pretrial.creditPlacement;
            return placement === "instance";
          }))
        : {},
      otherExpensesCent: input.otherExpenses?.[number]?.claimant || 0, configuration,
      groupParameters: claimantGroups.parameters
    });
    const defendantAttorneyCosts = calculateAttorneyCosts({
      baseFeeCent: defendantPositionFees.fees.procedure, valueCent: defendantValues.procedure,
      positionValues: defendantValues, positionFees: defendantPositionFees.fees, party: input.defendant,
      procedureFactor: instance.procedureFee, hearingFactor: input.hearingFactors[number].defendant,
      settlementFactor, settlementEnabled, vatRate: input.vatRate,
      otherExpensesCent: input.otherExpenses?.[number]?.defendant || 0, configuration,
      groupParameters: defendantGroups.parameters
    });
    const courtFee = lookupFee(feeTables, "GKG", input.effectiveDate, input.valueCent);
    const courtCosts = calculateCourtCosts(courtFee.lookup.feeCent, input.courtFactors[number]);
    return {
      number, claimantAttorneyCosts, defendantAttorneyCosts, additionalPartyAttorneyCosts: [], courtCosts,
      subtotalCent: claimantAttorneyCosts.totalCent + defendantAttorneyCosts.totalCent + courtCosts.totalCent,
      lookupWarnings: claimantPositionFees.exceededMaximum || defendantPositionFees.exceededMaximum || claimantGroups.exceededMaximum || defendantGroups.exceededMaximum || courtFee.lookup.exceededMaximum
    };
  }
  function calculate(input, feeTables, configuration = DEFAULT_CONFIGURATION) {
    assertCent(input.valueCent, "Streitwert");
    const baseGkg = lookupFee(feeTables, "GKG", input.effectiveDate, input.valueCent);
    const baseRvg = lookupFee(feeTables, "RVG", input.effectiveDate, input.valueCent);
    const pretrialEffectiveDate = input.pretrial.effectiveDate || input.effectiveDate;
    const pretrialRvg = lookupFee(feeTables, "RVG", pretrialEffectiveDate, input.pretrial.valueCent);
    const claimantGroups = normalizeGroups(input.claimant);
    const groupCredits = {};
    const pretrialFeeGroups = {};
    claimantGroups.forEach((group) => {
      const pretrialParameter = input.pretrial.groupParameters?.[group.groupId] || {};
      const instanceParameter = input.groupParameters?.instances?.[1]?.claimant?.[group.groupId] || {};
      const businessValueCent = Number.isInteger(pretrialParameter.businessValueCent) ? pretrialParameter.businessValueCent : input.pretrial.valueCent;
      const increaseValueCent = Number.isInteger(pretrialParameter.increaseValueCent) ? pretrialParameter.increaseValueCent : businessValueCent;
      const procedureValueCent = Number.isInteger(instanceParameter.feeValues?.procedure) ? instanceParameter.feeValues.procedure : input.feeValues[1].claimant.procedure;
      const requestedCreditValueCent = Number.isInteger(pretrialParameter.creditValueCent)
        ? pretrialParameter.creditValueCent
        : (Number.isInteger(input.pretrial.creditValueCent) ? input.pretrial.creditValueCent : input.pretrial.valueCent);
      const creditValueCent = Math.min(requestedCreditValueCent, procedureValueCent);
      const businessFactor = Number.isFinite(Number(pretrialParameter.businessFactor)) ? Number(pretrialParameter.businessFactor) : input.pretrial.businessFactor;
      const increase = groupIncrease(group, configuration);
      const increaseFactor = increase.increaseFactor;
      const creditRvg = lookupFee(feeTables, "RVG", pretrialEffectiveDate, creditValueCent);
      const firstProcedureRvg = lookupFee(feeTables, "RVG", input.effectiveDate, procedureValueCent);
      const procedureFactor = Number.isFinite(Number(instanceParameter.procedureFactor))
        ? Number(instanceParameter.procedureFactor)
        : configuration.instances[0].procedureFee;
      const firstProcedureFeeCent = roundCent(firstProcedureRvg.lookup.feeCent * procedureFactor);
      // Änderungsauftrag 38: Für die Anrechnung werden Geschäftsgebühr und Erhöhung Nr. 1008 VV RVG zusammengefasst.
      const creditFactorBasis = businessFactor + increaseFactor;
      const creditFeeCent = roundCent(creditRvg.lookup.feeCent * creditFactorBasis);
      groupCredits[group.groupId] = input.pretrial.enabled
        ? calculateCredit({ businessFeeCent: creditFeeCent, businessFeeFactor: creditFactorBasis, procedureBaseFeeCent: creditRvg.lookup.feeCent, procedureFeeCent: firstProcedureFeeCent, enabled: true })
        : { factor: 0, amountCent: 0 };
      pretrialFeeGroups[group.groupId] = {
        businessBaseFeeCent: lookupFee(feeTables, "RVG", pretrialEffectiveDate, businessValueCent).lookup.feeCent,
        increaseBaseFeeCent: lookupFee(feeTables, "RVG", pretrialEffectiveDate, increaseValueCent).lookup.feeCent,
        settlementBaseFeeCent: lookupFee(feeTables, "RVG", pretrialEffectiveDate, Number.isInteger(pretrialParameter.settlementValueCent) ? pretrialParameter.settlementValueCent : businessValueCent).lookup.feeCent,
        credit: groupCredits[group.groupId], creditValueCent
      };
    });
    const calculatedInput = { ...input, groupCredits };
    const pretrial = calculatePretrialCosts(calculatedInput.pretrial, { rvgFeeCent: pretrialRvg.lookup.feeCent, groups: pretrialFeeGroups }, configuration);
    const metadataCreditValueCent = pretrialFeeGroups[claimantGroups[0]?.groupId]?.creditValueCent ?? input.pretrial.creditValueCent;
    const pretrialSettlementEndsProceedings = input.pretrial.enabled
      && Object.values(input.pretrial.groupParameters || {}).some((group) => Boolean(group.settlementEnabled));
    let maxInstance = 3;
    if (pretrialSettlementEndsProceedings) maxInstance = 0;
    else if (input.termination.instance) maxInstance = input.termination.instance;
    if (input.valueCent <= 100000) maxInstance = Math.min(maxInstance, 1);
    else if (input.valueCent <= 2500000) maxInstance = Math.min(maxInstance, 2);
    const instances = configuration.instances.filter((x) => x.number <= maxInstance).map((instance) => calculateInstance({ instance, input: calculatedInput, feeTables, configuration }));
    let cumulative = pretrial.totalCent;
    instances.forEach((instance) => { cumulative += instance.subtotalCent; instance.cumulativeTotalCent = cumulative; });
    const warnings = [];
    if (input.valueCent <= 100000) warnings.push("Eine zweite Instanz wird bei einem Streitwert bis einschließlich 1.000,00 € nicht berücksichtigt.");
    if (input.valueCent <= 2500000) warnings.push("Eine dritte Instanz wird bei einem Streitwert bis einschließlich 25.000,00 € nicht berücksichtigt.");
    if (baseGkg.lookup.exceededMaximum || baseRvg.lookup.exceededMaximum || instances.some((x) => x.lookupWarnings)) warnings.push("Der Streitwert liegt oberhalb der höchsten Tabellenstufe; entsprechend der Arbeitsmappe wurde der letzte Tabellenwert verwendet.");
    const summary = {
      pretrialCent: pretrial.totalCent,
      firstInstanceCent: instances.find((x) => x.number === 1)?.subtotalCent || 0,
      secondInstanceCent: instances.find((x) => x.number === 2)?.subtotalCent || 0,
      thirdInstanceCent: instances.find((x) => x.number === 3)?.subtotalCent || 0
    };
    summary.totalRiskCent = summary.pretrialCent + summary.firstInstanceCent + summary.secondInstanceCent + summary.thirdInstanceCent;
    return { metadata: { creditValueCent: metadataCreditValueCent, calculatedAt: new Date().toISOString(), effectiveDate: input.effectiveDate, pretrialEffectiveDate, gkgVersion: baseGkg.version.effectiveFrom, rvgVersion: baseRvg.version.effectiveFrom, pretrialRvgVersion: pretrialRvg.version.effectiveFrom, valueCent: input.valueCent, gkgBaseFeeCent: baseGkg.lookup.feeCent, rvgBaseFeeCent: baseRvg.lookup.feeCent }, pretrial, instances, summary, warnings };
  }

  // Öffentliche, DOM-unabhängige Fach-API. Parameter und Ergebnisse verwenden durchgängig Centbeträge.
  global.InstanzenrisikoBerechnung = Object.freeze({ DEFAULT_CONFIGURATION, roundCent, calculate, calculateAttorneyCosts, calculateCourtCosts, calculatePretrialCosts, calculateInstance, calculateRepresentationGroups, calculateCredit, calculateExpenseAllowance });
})(window);
