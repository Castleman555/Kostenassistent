(function (global) {
  "use strict";
  const MODULE_NAME = "instanzenrisiko";
  const POSITIONS = ["procedure", "increase", "hearing", "settlement"];
  const { formatCent, parseGermanMoneyToCent } = global.FormUtils;
  const configuration = structuredClone(global.InstanzenrisikoBerechnung.DEFAULT_CONFIGURATION);
  let feeTables, storedData, activeCase, storedModule, elements;

  const uiState = {
    effectiveDate: "2025-06-01", valueCent: 0, vatRate: 0.19,
    termination: { instance: 0, type: "" }, pretrialEnabled: false,
    creditPlacement: "none", creditValueCent: 0, businessFactor: 1.3, pretrialEffectiveDate: null, feeValues: {}, hearingFactors: {}, otherExpenses: {}, groupParameters: { pretrial: {}, instances: {} }
  };

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    cacheElements();
    try {
      activeCase = global.KostenassistentStorage?.ensureActiveCase();
      storedModule = activeCase ? global.KostenassistentStorage.loadCaseModule(activeCase.fallId, MODULE_NAME) : null;
      storedData = storedModule?.data || null;
      if (!storedData) throw new Error("Es liegen keine gespeicherten Eingaben für das Instanzenrisiko vor.");
      feeTables = await global.GebuehrentabellenService.load();
      initializeState(); bindEvents(); elements.berechnungsBereich.hidden = false; recalculateAndRender();
    } catch (error) { showError(error.message || "Die Berechnung konnte nicht initialisiert werden."); }
  }

  function cacheElements() {
    elements = {
      fehler: document.getElementById("ausgabeFehler"), berechnungsBereich: document.getElementById("berechnungsBereich"),
      rechtsstand: document.getElementById("rechtsstand"), streitwert: document.getElementById("streitwertAusgabe"),
      terminationInstance: document.getElementById("beendigungsInstanz"), terminationType: document.getElementById("beendigungsArt"),
      warnungen: document.getElementById("warnungen"), status: document.getElementById("ausgabeStatus"), pretrial: document.getElementById("vorgerichtlichBereich"), instances: document.getElementById("instanzenContainer"), metadaten: document.getElementById("metadaten"),
      sums: [null, document.getElementById("summeInstanz1"), document.getElementById("summeInstanz2"), document.getElementById("summeInstanz3")],
      pretrialSum: document.getElementById("summeVorgerichtlich"), totalSum: document.getElementById("summeGesamt")
    };
  }

  function getValidSavedCent(value, fallbackCent) {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) && numericValue >= 0
      ? Math.round(numericValue)
      : fallbackCent;
  }

  function getValidVatRate(value, fallback = 0.19) {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) && numericValue >= 0 && numericValue <= 0.99
      ? numericValue
      : fallback;
  }

  function parseVatPercent(value) {
    const normalized = String(value ?? "").trim().replace("%", "").replace(",", ".");
    if (normalized === "") return null;
    const percent = Number(normalized);
    return Number.isFinite(percent) && percent >= 0 && percent <= 99 ? percent / 100 : null;
  }

  function makeDefaultFeeValues(valueCent) {
    const result = {};
    [1, 2, 3].forEach((instance) => {
      result[instance] = {};
      ["claimant", "defendant"].forEach((side) => {
        result[instance][side] = Object.fromEntries(POSITIONS.map((position) => [position, valueCent]));
      });
    });
    return result;
  }


  function getGroups(party) {
    const counts = new Map();
    (Array.isArray(party?.gruppen) ? party.gruppen : []).forEach((entry) => {
      const id = Number.parseInt(entry.gruppe, 10);
      if (Number.isInteger(id) && id > 0) counts.set(id, (counts.get(id) || 0) + 1);
    });
    if (!counts.size) return [{ groupId: 1, persons: Math.max(1, Number(party?.anzahlPersonen) || 1) }];
    return [...counts.entries()].sort((a, b) => a[0] - b[0]).map(([groupId, persons]) => ({ groupId, persons }));
  }

  function defaultIncreaseFactor(persons) {
    return Math.min(Math.max(0, persons - 1) * configuration.additionalClientRate, configuration.additionalClientMaximum);
  }

  function initializeGroupParameters(saved) {
    const result = { pretrial: {}, instances: { 1: { claimant: {}, defendant: {} }, 2: { claimant: {}, defendant: {} }, 3: { claimant: {}, defendant: {} } } };
    getGroups(storedData.klaegerseite).forEach(({ groupId, persons }) => {
      const old = saved.groupParameters?.pretrial?.[groupId] || {};
      result.pretrial[groupId] = {
        businessValueCent: getValidSavedCent(old.businessValueCent, uiState.valueCent),
        increaseValueCent: getValidSavedCent(old.increaseValueCent, uiState.valueCent),
        creditValueCent: getValidSavedCent(old.creditValueCent, uiState.creditValueCent),
        businessFactor: Number.isFinite(Number(old.businessFactor)) ? Number(old.businessFactor) : uiState.businessFactor,
        settlementEnabled: Boolean(old.settlementEnabled),
        settlementValueCent: getValidSavedCent(old.settlementValueCent, uiState.valueCent),
        settlementFactor: configuration.pretrial.settlementFee,
        otherExpensesCent: getValidSavedCent(old.otherExpensesCent, 0),
        vatRate: getValidVatRate(old.vatRate, saved.vatRate ?? uiState.vatRate),
        creditPlacement: old.creditPlacement === "pretrial" || old.creditPlacement === "instance"
          ? old.creditPlacement
          : (saved.creditPlacement === "pretrial" ? "pretrial" : "instance")
      };
    });
    [1, 2, 3].forEach((instance) => {
      [["claimant", storedData.klaegerseite], ["defendant", storedData.beklagtenseite]].forEach(([side, party]) => {
        getGroups(party).forEach(({ groupId, persons }) => {
          const old = saved.groupParameters?.instances?.[instance]?.[side]?.[groupId] || {};
          result.instances[instance][side][groupId] = {
            feeValues: Object.fromEntries(POSITIONS.map((position) => [position, getValidSavedCent(old.feeValues?.[position], uiState.feeValues[instance][side][position])])),
            procedureFactor: configuration.instances[instance - 1].procedureFee,
                hearingFactor: Number.isFinite(Number(old.hearingFactor)) ? Number(old.hearingFactor) : uiState.hearingFactors[instance][side],
            settlementFactor: instance === 1 ? 1.0 : 1.3,
            otherExpensesCent: getValidSavedCent(old.otherExpensesCent, uiState.otherExpenses[instance][side]),
            vatRate: getValidVatRate(old.vatRate, saved.vatRate ?? uiState.vatRate)
          };
        });
      });
    });
    return result;
  }

  function resetGroupParameters(valueCent) {
    getGroups(storedData.klaegerseite).forEach(({ groupId, persons }) => {
      const group = uiState.groupParameters.pretrial[groupId];
      if (!group) return;
      group.businessValueCent = valueCent;
      group.increaseValueCent = valueCent;
      group.creditValueCent = valueCent;
      group.businessFactor = uiState.businessFactor;
      group.settlementEnabled = false;
      group.settlementValueCent = valueCent;
      group.settlementFactor = configuration.pretrial.settlementFee;
      group.otherExpensesCent = 0;
      group.vatRate = configuration.vatRate;
      group.creditPlacement = "instance";
    });
    [1, 2, 3].forEach((instance) => {
      [["claimant", storedData.klaegerseite], ["defendant", storedData.beklagtenseite]].forEach(([side, party]) => {
        getGroups(party).forEach(({ groupId, persons }) => {
          const group = uiState.groupParameters.instances[instance][side][groupId];
          if (!group) return;
          POSITIONS.forEach((position) => { group.feeValues[position] = valueCent; });
          group.procedureFactor = configuration.instances[instance - 1].procedureFee;
              group.hearingFactor = instance === 3 ? 1.5 : 1.2;
          group.settlementFactor = instance === 1 ? 1.0 : 1.3;
          group.otherExpensesCent = 0;
          group.vatRate = configuration.vatRate;
        });
      });
    });
  }

  function overwriteAllIndividualValues(valueCent) {
    uiState.feeValues = makeDefaultFeeValues(valueCent);
    uiState.creditValueCent = valueCent;
    if (uiState.groupParameters?.instances) resetGroupParameters(valueCent);
  }

  function resetInstanceValues(instance) {
    ["claimant", "defendant"].forEach((side) => {
      POSITIONS.forEach((position) => { uiState.feeValues[instance][side][position] = uiState.valueCent; });
      uiState.hearingFactors[instance][side] = instance === 3 ? 1.5 : 1.2;
      uiState.otherExpenses[instance][side] = 0;
      const party = side === "claimant" ? storedData.klaegerseite : storedData.beklagtenseite;
      getGroups(party).forEach(({ groupId, persons }) => {
        const group = uiState.groupParameters.instances[instance][side][groupId];
        if (!group) return;
        POSITIONS.forEach((position) => { group.feeValues[position] = uiState.valueCent; });
        group.procedureFactor = configuration.instances[instance - 1].procedureFee;
          group.hearingFactor = instance === 3 ? 1.5 : 1.2;
        group.settlementFactor = instance === 1 ? 1.0 : 1.3;
        group.otherExpensesCent = 0;
        group.vatRate = configuration.vatRate;
      });
    });
    if (instance === 1) {
      uiState.creditValueCent = uiState.valueCent;
      Object.values(uiState.groupParameters.pretrial).forEach((group) => { group.creditValueCent = uiState.valueCent; });
    }
  }

  function resetAllInstanceValues() {
    [1, 2, 3].forEach(resetInstanceValues);
  }

  function initializeState() {
    const saved = storedModule?.ausgabe || {};
    uiState.valueCent = storedData.streitwert?.gesamtCent || 0;
    uiState.effectiveDate = ["2025-06-01", "2021-01-01", "2013-08-01", "2004-07-01"].includes(saved.effectiveDate || storedData.rechtsstand) ? (saved.effectiveDate || storedData.rechtsstand) : "2025-06-01";
    uiState.pretrialEnabled = saved.pretrialEnabled ?? Boolean(storedData.vorgerichtlicheTaetigkeitKlaeger);
    uiState.businessFactor = Number.isFinite(Number(saved.businessFactor)) ? Number(saved.businessFactor) : 1.3;
    uiState.pretrialEffectiveDate = saved.pretrialEffectiveDate || null;
    uiState.creditPlacement = uiState.pretrialEnabled ? (saved.creditPlacement === "pretrial" ? "pretrial" : "instance") : "none";
    uiState.creditValueCent = getValidSavedCent(saved.creditValueCent, uiState.valueCent);
    uiState.termination = saved.termination || { instance: 0, type: "" };
    uiState.feeValues = makeDefaultFeeValues(uiState.valueCent);
    [1, 2, 3].forEach((n) => {
      ["claimant", "defendant"].forEach((side) => {
        POSITIONS.forEach((position) => {
          const legacy = saved.attorneyValues?.[n]?.[side];
          const savedPositionValue = saved.feeValues?.[n]?.[side]?.[position] ?? legacy;
          uiState.feeValues[n][side][position] = getValidSavedCent(savedPositionValue, uiState.valueCent);
        });
      });
    });
    uiState.otherExpenses = {
      1: { claimant: saved.otherExpenses?.[1]?.claimant ?? 0, defendant: saved.otherExpenses?.[1]?.defendant ?? 0 },
      2: { claimant: saved.otherExpenses?.[2]?.claimant ?? 0, defendant: saved.otherExpenses?.[2]?.defendant ?? 0 },
      3: { claimant: saved.otherExpenses?.[3]?.claimant ?? 0, defendant: saved.otherExpenses?.[3]?.defendant ?? 0 }
    };
    uiState.hearingFactors = {
      1: { claimant: 1.2, defendant: 1.2 },
      2: { claimant: 1.2, defendant: 1.2 },
      3: { claimant: 1.5, defendant: 1.5 }
    };
    [1, 2, 3].forEach((n) => {
      ["claimant", "defendant"].forEach((side) => {
        uiState.hearingFactors[n][side] = saved.hearingFactors?.[n]?.[side] ?? (typeof saved.hearingFactors?.[n] === "number" ? saved.hearingFactors[n] : uiState.hearingFactors[n][side]);
      });
    });
    uiState.groupParameters = initializeGroupParameters(saved);
    elements.rechtsstand.value = uiState.effectiveDate;
    elements.streitwert.value = formatCent(uiState.valueCent);
    elements.terminationInstance.value = uiState.termination.instance ? String(uiState.termination.instance) : "";
    updateTerminationOptions(false); elements.terminationType.value = uiState.termination.type || "";
  }

  function bindEvents() {
    elements.rechtsstand.addEventListener("change", recalculateAndRender);
    elements.streitwert.addEventListener("focus", (event) => { event.target.value = (uiState.valueCent / 100).toFixed(2).replace(".", ","); event.target.select(); });
    elements.streitwert.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      commitCourtValue();
      elements.streitwert.blur();
    });
    elements.streitwert.addEventListener("blur", commitCourtValue);
    elements.terminationInstance.addEventListener("change", () => { updateTerminationOptions(true); recalculateAndRender(); });
    elements.terminationType.addEventListener("change", recalculateAndRender);
    elements.pretrial.addEventListener("change", handleDynamicChange);
    elements.pretrial.addEventListener("keydown", handleDynamicKeydown);
    elements.pretrial.addEventListener("blur", handleDynamicBlur, true);
    elements.pretrial.addEventListener("focus", handleDynamicFocus, true);
    elements.instances.addEventListener("change", handleDynamicChange);
    elements.instances.addEventListener("click", handleDynamicClick);
    elements.instances.addEventListener("keydown", handleDynamicKeydown);
    elements.instances.addEventListener("blur", handleDynamicBlur, true);
    elements.instances.addEventListener("focus", handleDynamicFocus, true);
  }

  function handleDynamicChange(event) {
    const target = event.target;
    if (target.matches("[data-pretrial-enabled]")) {
      uiState.pretrialEnabled = target.checked;
      uiState.creditPlacement = target.checked ? "instance" : "none";
      Object.values(uiState.groupParameters.pretrial).forEach((group) => {
        if (!target.checked) group.creditPlacement = "none";
        else if (group.creditPlacement !== "pretrial" && group.creditPlacement !== "instance") group.creditPlacement = "instance";
      });
    } else if (target.matches("[data-credit-placement]")) {
      const groupId = target.dataset.groupId;
      if (groupId && uiState.groupParameters.pretrial[groupId]) {
        const group = uiState.groupParameters.pretrial[groupId];
        if (!uiState.pretrialEnabled) group.creditPlacement = "none";
        else if (target.checked) group.creditPlacement = target.dataset.creditPlacement;
        else group.creditPlacement = target.dataset.creditPlacement === "instance" ? "pretrial" : "instance";
      } else if (!uiState.pretrialEnabled) uiState.creditPlacement = "none";
      else if (target.checked) uiState.creditPlacement = target.dataset.creditPlacement;
      else uiState.creditPlacement = target.dataset.creditPlacement === "instance" ? "pretrial" : "instance";
    } else if (target.matches("[data-business-factor]")) {
      const groupId = target.dataset.groupId;
      if (groupId) uiState.groupParameters.pretrial[groupId].businessFactor = Number(target.value);
      else uiState.businessFactor = Number(target.value);
    } else if (target.matches("[data-pretrial-settlement-enabled]")) {
      const groupId = target.dataset.pretrialSettlementEnabled;
      uiState.groupParameters.pretrial[groupId].settlementEnabled = target.checked;
    } else if (target.matches("[data-instance-settlement-enabled]")) {
      const instance = Number(target.dataset.instanceSettlementEnabled);
      if (target.checked) {
        elements.terminationInstance.value = String(instance);
        uiState.termination = { instance, type: "comparison" };
        updateTerminationOptions(false);
        elements.terminationType.value = "comparison";
      } else if (Number(elements.terminationInstance.value) === instance && elements.terminationType.value === "comparison") {
        elements.terminationInstance.value = "";
        uiState.termination = { instance: 0, type: "" };
        updateTerminationOptions(false);
      }
    } else if (target.matches("[data-pretrial-effective-date]")) {
      uiState.pretrialEffectiveDate = target.value || null;
    } else if (target.matches("[data-hearing-factor]")) {
      const [instance, side, groupId] = target.dataset.hearingFactor.split(":");
      if (groupId) uiState.groupParameters.instances[instance][side][groupId].hearingFactor = Number(target.value);
      else uiState.hearingFactors[instance][side] = Number(target.value);
    } else if (target.matches("[data-vat-rate]")) {
      commitVatField(target);
      return;
    } else if (target.matches("[data-group-factor]")) {
      const [scope, instance, side, groupId, field] = target.dataset.groupFactor.split(":");
      if (scope === "pretrial") uiState.groupParameters.pretrial[groupId][field] = Number(target.value);
      else uiState.groupParameters.instances[instance][side][groupId][field] = Number(target.value);
    }
    recalculateAndRender();
  }


  function handleDynamicInput() { /* Rückwärtskompatibler No-op: Beträge werden nur über Enter oder Blur bestätigt. */ }

  function handleDynamicKeydown(event) {
    const target = event.target;
    if (event.key !== "Enter" || !target.matches("[data-fee-value], [data-other-expenses], [data-credit-value], [data-pretrial-value], [data-pretrial-other-expenses], [data-vat-rate]")) return;
    event.preventDefault();
    if (target.matches("[data-vat-rate]")) commitVatField(target);
    else commitMoneyField(target);
    target.blur();
  }

  function handleDynamicClick(event) {
    const pretrialGroupButton = event.target.closest("[data-reset-pretrial-group]");
    if (pretrialGroupButton) {
      const groupId = pretrialGroupButton.dataset.resetPretrialGroup;
      resetPretrialGroup(groupId);
      showStatus(`Vorgerichtliche Vertretungsgruppe ${groupId} wurde auf die Ausgangswerte zurückgesetzt.`);
      recalculateAndRender();
      return;
    }
    const groupButton = event.target.closest("[data-reset-group]");
    if (groupButton) {
      const [instance, side, groupId] = groupButton.dataset.resetGroup.split(":");
      resetSingleGroup(Number(instance), side, groupId);
      showStatus(`Vertretungsgruppe ${groupId} wurde auf die Ausgangswerte zurückgesetzt.`);
      recalculateAndRender();
      return;
    }
    const button = event.target.closest("[data-reset-instance]");
    if (!button) return;
    const instance = Number(button.dataset.resetInstance);
    resetInstanceValues(instance);
    showStatus(`Die Werte der ${roman(instance)}. Instanz wurden auf die definierten Ausgangswerte zurückgesetzt.`);
    recalculateAndRender();
  }

  function resetPretrialGroup(groupId) {
    const group = uiState.groupParameters.pretrial[groupId];
    if (!group) return;
    const persons = getGroups(storedData.klaegerseite).find((entry) => String(entry.groupId) === String(groupId))?.persons || 1;
    group.businessValueCent = uiState.valueCent;
    group.increaseValueCent = uiState.valueCent;
    group.creditValueCent = uiState.valueCent;
    group.businessFactor = uiState.businessFactor;
    group.settlementEnabled = false;
    group.settlementValueCent = uiState.valueCent;
    group.settlementFactor = configuration.pretrial.settlementFee;
    group.otherExpensesCent = 0;
    group.vatRate = configuration.vatRate;
    group.creditPlacement = "instance";
  }

  function resetSingleGroup(instance, side, groupId) {
    const group = uiState.groupParameters.instances[instance][side][groupId];
    if (!group) return;
    const party = side === "claimant" ? storedData.klaegerseite : storedData.beklagtenseite;
    const persons = getGroups(party).find((entry) => String(entry.groupId) === String(groupId))?.persons || 1;
    POSITIONS.forEach((position) => { group.feeValues[position] = uiState.valueCent; });
    group.procedureFactor = configuration.instances[instance - 1].procedureFee;
    group.hearingFactor = instance === 3 ? 1.5 : 1.2;
    group.settlementFactor = instance === 1 ? 1.0 : 1.3;
    group.otherExpensesCent = 0;
    group.vatRate = configuration.vatRate;
    if (instance === 1 && side === "claimant" && uiState.groupParameters.pretrial[groupId]) {
      uiState.groupParameters.pretrial[groupId].creditValueCent = uiState.valueCent;
    }
  }

  function handleDynamicFocus(event) {
    const target = event.target;
    if (target.matches("[data-fee-value]")) {
      const cents = getFeeValue(target); target.value = (cents / 100).toFixed(2).replace(".", ","); target.select();
    } else if (target.matches("[data-credit-value]")) {
      const groupId = target.dataset.groupId;
      const cents = groupId ? uiState.groupParameters.pretrial[groupId].creditValueCent : uiState.creditValueCent;
      target.value = (cents / 100).toFixed(2).replace(".", ","); target.select();
    } else if (target.matches("[data-pretrial-value]")) {
      const [groupId, position] = target.dataset.pretrialValue.split(":");
      target.value = (uiState.groupParameters.pretrial[groupId][position] / 100).toFixed(2).replace(".", ","); target.select();
    } else if (target.matches("[data-pretrial-other-expenses]")) {
      const groupId = target.dataset.pretrialOtherExpenses;
      const cents = uiState.groupParameters.pretrial[groupId].otherExpensesCent;
      target.value = (cents / 100).toFixed(2).replace(".", ","); target.select();
    } else if (target.matches("[data-other-expenses]")) {
      const [instance, side, groupId] = target.dataset.otherExpenses.split(":");
      const cents = groupId ? uiState.groupParameters.instances[instance][side][groupId].otherExpensesCent : uiState.otherExpenses[instance][side];
      target.value = (cents / 100).toFixed(2).replace(".", ","); target.select();
    }
  }

  function handleDynamicBlur(event) {
    const target = event.target;
    if (target.matches("[data-fee-value], [data-other-expenses], [data-credit-value], [data-pretrial-value], [data-pretrial-other-expenses]")) commitMoneyField(target);
    else if (target.matches("[data-vat-rate]")) commitVatField(target);
  }

  function commitMoneyField(target) {
    if (target.dataset.commitDone === "true") { delete target.dataset.commitDone; return; }
    const parsed = parseGermanMoneyToCent(target.value);
    const valid = parsed !== null && parsed >= 0;
    target.classList.toggle("input-error", !valid);
    target.setAttribute("aria-invalid", valid ? "false" : "true");
    if (!valid) {
      showStatus("Bitte geben Sie einen gültigen, nicht negativen Eurobetrag ein.");
      return;
    }
    if (target.matches("[data-fee-value]")) {
      const [instance, side, position, groupId] = target.dataset.feeValue.split(":");
      const holder = groupId ? uiState.groupParameters.instances[instance][side][groupId].feeValues : uiState.feeValues[instance][side];
      if (holder[position] === parsed) { target.value = formatCent(parsed); return; }
      holder[position] = parsed;
    } else if (target.matches("[data-credit-value]")) {
      const groupId = target.dataset.groupId;
      if (groupId) uiState.groupParameters.pretrial[groupId].creditValueCent = parsed;
      else uiState.creditValueCent = parsed;
    } else if (target.matches("[data-pretrial-value]")) {
      const [groupId, position] = target.dataset.pretrialValue.split(":");
      uiState.groupParameters.pretrial[groupId][position] = parsed;
    } else if (target.matches("[data-pretrial-other-expenses]")) {
      uiState.groupParameters.pretrial[target.dataset.pretrialOtherExpenses].otherExpensesCent = parsed;
    } else {
      const [instance, side, groupId] = target.dataset.otherExpenses.split(":");
      if (groupId) uiState.groupParameters.instances[instance][side][groupId].otherExpensesCent = parsed;
      else uiState.otherExpenses[instance][side] = parsed;
    }
    target.dataset.commitDone = "true";
    recalculateAndRender();
  }


  function commitVatField(target) {
    const parsed = parseVatPercent(target.value);
    const valid = parsed !== null;
    target.classList.toggle("input-error", !valid);
    target.setAttribute("aria-invalid", valid ? "false" : "true");
    const [scope, instance, side, groupId] = target.dataset.vatRate.split(":");
    const vatRate = valid ? parsed : configuration.vatRate;
    if (scope === "pretrial") uiState.groupParameters.pretrial[groupId].vatRate = vatRate;
    else uiState.groupParameters.instances[instance][side][groupId].vatRate = vatRate;
    if (!valid) showStatus("Ungültiger Umsatzsteuersatz. Das Feld wurde auf 19 Prozent zurückgesetzt.");
    recalculateAndRender();
  }

  function commitCourtValue() {
    const parsed = parseGermanMoneyToCent(elements.streitwert.value);
    if (parsed === null || parsed < 0) {
      elements.streitwert.classList.add("input-error");
      elements.streitwert.setAttribute("aria-invalid", "true");
      showStatus("Bitte geben Sie einen gültigen, nicht negativen gerichtlichen Streitwert ein.");
      return;
    }
    elements.streitwert.classList.remove("input-error");
    elements.streitwert.setAttribute("aria-invalid", "false");
    if (uiState.valueCent !== parsed) {
      uiState.valueCent = parsed;
      storedData.streitwert = { modus: "gesamt", gesamtCent: parsed, teilwerte: [] };
      overwriteAllIndividualValues(parsed);
      resetAllInstanceValues();
      showStatus("Der gerichtliche Streitwert wurde gespeichert. Die Ausgangswerte aller Instanzen wurden wiederhergestellt und die Berechnung vollständig aktualisiert.");
      updateTerminationAvailability();
      recalculateAndRender();
    }
    elements.streitwert.value = formatCent(uiState.valueCent);
  }

  function getFeeValue(target) {
    const [instance, side, position, groupId] = target.dataset.feeValue.split(":");
    return groupId ? uiState.groupParameters.instances[instance][side][groupId].feeValues[position] : uiState.feeValues[instance][side][position];
  }

  function updateTerminationAvailability() {
    const second = elements.terminationInstance.querySelector('option[value="2"]');
    const third = elements.terminationInstance.querySelector('option[value="3"]');
    second.disabled = uiState.valueCent <= 100000;
    third.disabled = uiState.valueCent <= 2500000;
    const selected = elements.terminationInstance.value;
    if ((second.disabled && selected === "2") || (third.disabled && selected === "3")) {
      elements.terminationInstance.value = "";
      updateTerminationOptions(true);
    }
  }

  function updateTerminationOptions(resetType) {
    updateTerminationAvailability();
    const instance = Number(elements.terminationInstance.value || 0);
    const prior = resetType ? "" : uiState.termination.type;
    const options = [{ value: "", label: "– keine Auswahl –" }];
    if (instance === 1) options.push({ value: "comparison", label: "Vergleich" }, { value: "withdrawal", label: "Klagerücknahme" }, { value: "zpo91a", label: "§ 91a ZPO" }, { value: "waiver", label: "Verzicht" });
    if (instance === 2 || instance === 3) options.push({ value: "comparison", label: "Vergleich" });
    elements.terminationType.replaceChildren(...options.map((item) => { const option = document.createElement("option"); option.value = item.value; option.textContent = item.label; return option; }));
    elements.terminationType.disabled = instance === 0;
    elements.terminationType.value = options.some((x) => x.value === prior) ? prior : "";
  }

  function buildInput() {
    uiState.effectiveDate = elements.rechtsstand.value;
    uiState.termination = { instance: Number(elements.terminationInstance.value || 0), type: elements.terminationType.value };
    const courtFactors = { 1: 3, 2: 4, 3: 5 };
    if (uiState.termination.instance === 1 && uiState.termination.type) courtFactors[1] = 1;
    if (uiState.termination.instance === 2 && uiState.termination.type === "comparison") courtFactors[2] = 2;
    if (uiState.termination.instance === 3 && uiState.termination.type === "comparison") courtFactors[3] = 3;
    return {
      effectiveDate: uiState.effectiveDate, valueCent: uiState.valueCent, vatRate: uiState.vatRate,
      claimant: storedData.klaegerseite, defendant: storedData.beklagtenseite,
      termination: uiState.termination, courtFactors, feeValues: uiState.feeValues, hearingFactors: uiState.hearingFactors,
      otherExpenses: uiState.otherExpenses, groupParameters: uiState.groupParameters,
      pretrial: { enabled: uiState.pretrialEnabled, creditPlacement: uiState.creditPlacement, creditValueCent: uiState.creditValueCent, party: storedData.klaegerseite, valueCent: uiState.valueCent, businessFactor: uiState.businessFactor, effectiveDate: uiState.pretrialEffectiveDate || uiState.effectiveDate, otherExpensesCent: 0, vatRate: uiState.vatRate, groupParameters: uiState.groupParameters.pretrial }
    };
  }

  function recalculateAndRender() {
    try { elements.fehler.hidden = true; const result = global.InstanzenrisikoBerechnung.calculate(buildInput(), feeTables, configuration); renderResult(result); saveUiState(); }
    catch (error) { console.error(error); showError(error.message); }
  }

  function serializeGroupParameters() {
    const serialized = structuredClone(uiState.groupParameters);
    Object.values(serialized.pretrial || {}).forEach((group) => { delete group.increaseFactor; });
    [1, 2, 3].forEach((instance) => {
      ["claimant", "defendant"].forEach((side) => {
        Object.values(serialized.instances?.[instance]?.[side] || {}).forEach((group) => { delete group.increaseFactor; });
      });
    });
    return serialized;
  }

  function saveUiState() {
    if (!activeCase) return;
    global.KostenassistentStorage.updateCaseModule(activeCase.fallId, MODULE_NAME, { ...storedModule, data: storedData, ausgabe: { effectiveDate: uiState.effectiveDate, termination: uiState.termination, pretrialEnabled: uiState.pretrialEnabled, creditPlacement: uiState.creditPlacement, creditValueCent: uiState.creditValueCent, feeValues: uiState.feeValues, hearingFactors: uiState.hearingFactors, businessFactor: uiState.businessFactor, pretrialEffectiveDate: uiState.pretrialEffectiveDate, otherExpenses: uiState.otherExpenses, groupParameters: serializeGroupParameters() } });
  }

  function renderResult(result) {
    const pretrialSettlementEndsProceedings = uiState.pretrialEnabled
      && Object.values(uiState.groupParameters.pretrial).some((group) => Boolean(group.settlementEnabled));
    elements.pretrialSum.textContent = formatCent(result.summary.pretrialCent);
    [1, 2, 3].forEach((n) => {
      elements.sums[n].textContent = formatCent(result.summary[["", "firstInstanceCent", "secondInstanceCent", "thirdInstanceCent"][n]]);
      elements.sums[n].closest("article").hidden = pretrialSettlementEndsProceedings
        || (n === 2 && uiState.valueCent <= 100000)
        || (n === 3 && uiState.valueCent <= 2500000);
    });
    elements.totalSum.textContent = formatCent(result.summary.totalRiskCent);
    elements.warnungen.hidden = result.warnings.length === 0; elements.warnungen.textContent = result.warnings.join(" ");
    renderPretrial(result.pretrial); elements.instances.replaceChildren(...result.instances.map(renderInstance));
    elements.metadaten.innerHTML = `<div><dt>Fall</dt><dd>${escapeHtml(activeCase?.fallname || "Unbenannter Fall")}</dd></div><div><dt>Streitwert</dt><dd>${formatCent(result.metadata.valueCent)}</dd></div><div><dt>GKG-Rechtsstand</dt><dd>${formatDate(result.metadata.gkgVersion)}</dd></div><div><dt>RVG-Rechtsstand</dt><dd>${formatDate(result.metadata.rvgVersion)}</dd></div><div><dt>RVG-Rechtsstand vorgerichtlich</dt><dd>${formatDate(result.metadata.pretrialRvgVersion)}</dd></div><div><dt>Einfache GKG-Gebühr</dt><dd>${formatCent(result.metadata.gkgBaseFeeCent)}</dd></div><div><dt>Einfache RVG-Gebühr</dt><dd>${formatCent(result.metadata.rvgBaseFeeCent)}</dd></div>`;
  }

  function renderPretrial(pretrial) {
    elements.pretrial.hidden = false;
    const dateOptions = [{ value: "", label: "Allgemeinen Rechtsstand verwenden" }, ...Array.from(elements.rechtsstand.options, (option) => ({ value: option.value, label: option.textContent }))]
      .map((option) => `<option value="${option.value}"${(uiState.pretrialEffectiveDate || "") === option.value ? " selected" : ""}>${option.label}</option>`).join("");
    elements.pretrial.innerHTML = `<h2>Vorgerichtliche Rechtsanwaltskosten <label class="heading-checkbox"><input type="checkbox" data-pretrial-enabled ${uiState.pretrialEnabled ? "checked" : ""}> berücksichtigen</label></h2><div class="compact-field pretrial-date-field"><label for="vorgerichtlicherRechtsstand">Rechtsstand vorgerichtliche Rechtsanwaltskosten</label><select id="vorgerichtlicherRechtsstand" data-pretrial-effective-date>${dateOptions}</select></div>${uiState.pretrialEnabled ? renderAttorneyTable(pretrial.claimant, "Klägerseite – vorgerichtlich", { pretrial: true }) : '<p class="muted-text">Vorgerichtliche Rechtsanwaltskosten sind deaktiviert.</p>'}`;
  }

  function renderInstance(instance) {
    const section = document.createElement("section"); section.className = "form-card instance-card";
    const n = instance.number;
    section.innerHTML = `<h2 class="instance-heading"><span>${roman(n)}. Instanz</span><button type="button" class="secondary-button compact-button" data-reset-instance="${n}">Werte zurücksetzen</button></h2><div class="result-two-column"><div>${renderAttorneyTable(instance.claimantAttorneyCosts, "Rechtsanwaltskosten Klägerseite", { instance: n, side: "claimant" })}</div><div>${renderAttorneyTable(instance.defendantAttorneyCosts, "Rechtsanwaltskosten Beklagtenseite", { instance: n, side: "defendant" })}</div></div><h3>Gerichtskosten</h3><div class="result-line"><span>Gerichtsgebühren (${formatFactor(instance.courtCosts.factor)})</span><strong>${formatCent(instance.courtCosts.amountCent)}</strong></div><div class="result-line result-total"><span>Gesamt ${roman(n)}. Instanz</span><strong>${formatCent(instance.subtotalCent)}</strong></div><div class="result-line"><span>Kumuliertes Risiko</span><strong>${formatCent(instance.cumulativeTotalCent)}</strong></div>`;
    return section;
  }

  function renderAttorneyTable(costs, title, context = {}) {
    const rows = costs.groups.map((group) => {
      if (context.pretrial) {
        const credit = rowWithCheckbox("Anrechnung", uiState.groupParameters.pretrial[group.groupId].creditValueCent, group.creditFactor ? -group.creditFactor : 0, group.creditCent || 0, "pretrial", uiState.groupParameters.pretrial[group.groupId].creditPlacement === "pretrial", uiState.pretrialEnabled, group.groupId);
        return `<tr><th colspan="4" scope="rowgroup"><span>Vertretungsgruppe ${group.groupId} (${group.persons} Person${group.persons === 1 ? "" : "en"})</span> <button type="button" class="secondary-button compact-button group-reset-button" data-reset-pretrial-group="${group.groupId}">Werte zurücksetzen</button></th></tr>${businessRow(group)}${pretrialIncreaseRow(group)}${pretrialSettlementRow(group)}${credit}${editablePretrialOtherExpensesRow(group)}${row("Auslagenpauschale", null, null, group.expenseAllowanceCent)}${row("Zwischensumme", null, null, group.subtotalCent, true)}${vatRow("pretrial:0:claimant:" + group.groupId, group.vatRate, group.vatCent)}${row("Gesamt", null, null, group.totalCent, true)}`;
      }
      const groupContext = { ...context, groupId: group.groupId };
      const creditRow = context.instance === 1 && context.side === "claimant"
        ? rowWithCheckbox("Anrechnung", uiState.groupParameters.pretrial[group.groupId]?.creditValueCent ?? uiState.creditValueCent, group.creditFactor ? -group.creditFactor : 0, group.creditCent || 0, "instance", uiState.groupParameters.pretrial[group.groupId]?.creditPlacement === "instance", uiState.pretrialEnabled, group.groupId)
        : "";
      return `<tr><th colspan="4" scope="rowgroup"><span>Vertretungsgruppe ${group.groupId} (${group.persons} Person${group.persons === 1 ? "" : "en"})</span> <button type="button" class="secondary-button compact-button group-reset-button" data-reset-group="${context.instance}:${context.side}:${group.groupId}">Werte zurücksetzen</button></th></tr>${editableRow("Verfahrensgebühr", groupContext, "procedure", group.procedureFactor, group.procedureCent)}${editableIncreaseRow(groupContext, group.increaseFactor, group.increaseCent)}${creditRow}${editableRow("Terminsgebühr", groupContext, "hearing", group.hearingFactor, group.hearingCent, true)}${editableRow("Einigungsgebühr", groupContext, "settlement", group.settlementFactor, group.settlementCent)}${editableOtherExpensesRow(groupContext, group.otherExpensesCent)}${row("Auslagenpauschale", null, null, group.expenseAllowanceCent)}${row("Zwischensumme", null, null, group.subtotalCent, true)}${vatRow("instance:" + context.instance + ":" + context.side + ":" + group.groupId, group.vatRate, group.vatCent)}${row("Gesamt", null, null, group.totalCent, true)}`;
    }).join("");
    return `<h3>${escapeHtml(title)}</h3><div class="table-wrap"><table class="data-table result-table"><thead><tr><th scope="col">Position</th><th scope="col">Gegenstandswert</th><th scope="col">Faktor</th><th scope="col">Betrag</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }


  function businessRow(group) {
    const parameter = uiState.groupParameters.pretrial[group.groupId];
    const options = [];
    for (let value = 0.5; value <= 2.5001; value += 0.1) {
      const rounded = Math.round(value * 10) / 10;
      options.push(`<option value="${rounded}"${Math.abs(parameter.businessFactor - rounded) < 0.001 ? " selected" : ""}>${formatFactor(rounded)}</option>`);
    }
    return `<tr><th scope="row">Geschäftsgebühr</th><td><input class="fee-value-input" type="text" inputmode="decimal" data-pretrial-value="${group.groupId}:businessValueCent" value="${formatCent(parameter.businessValueCent)}" aria-label="Gegenstandswert Geschäftsgebühr Vertretungsgruppe ${group.groupId}"></td><td><select data-business-factor data-group-id="${group.groupId}" aria-label="Faktor Geschäftsgebühr Vertretungsgruppe ${group.groupId}">${options.join("")}</select></td><td>${formatCent(group.businessCent || 0)}</td></tr>`;
  }

  function pretrialIncreaseRow(group) {
    const parameter = uiState.groupParameters.pretrial[group.groupId];
    return `<tr><th scope="row">Erhöhung Nr. 1008 VV RVG</th><td><input class="fee-value-input" type="text" inputmode="decimal" data-pretrial-value="${group.groupId}:increaseValueCent" value="${formatCent(parameter.increaseValueCent)}" aria-label="Gegenstandswert Erhöhung Vertretungsgruppe ${group.groupId}"></td><td><output aria-label="Automatisch ermittelter Faktor Erhöhung Vertretungsgruppe ${group.groupId}">${formatFactor(group.increaseFactor)}</output></td><td>${formatCent(group.increaseCent)}</td></tr>`;
  }

  function pretrialSettlementRow(group) {
    const parameter = uiState.groupParameters.pretrial[group.groupId];
    const enabled = Boolean(parameter.settlementEnabled);
    return `<tr><th scope="row"><label><input type="checkbox" data-pretrial-settlement-enabled="${group.groupId}" ${enabled ? "checked" : ""}> Einigungsgebühr</label></th><td><input class="fee-value-input" type="text" inputmode="decimal" data-pretrial-value="${group.groupId}:settlementValueCent" value="${formatCent(parameter.settlementValueCent)}" aria-label="Gegenstandswert Einigungsgebühr Vertretungsgruppe ${group.groupId}" ${enabled ? "" : "disabled"}></td><td><output aria-label="Fest vorgegebener Faktor Einigungsgebühr Klägerseite vorgerichtlich Vertretungsgruppe ${group.groupId}">${formatFactor(parameter.settlementFactor)}</output></td><td>${formatCent(group.settlementCent)}</td></tr>`;
  }


  function editableIncreaseRow(context, factor, amountCent) {
    const key = `${context.instance}:${context.side}:increase:${context.groupId}`;
    const parameter = uiState.groupParameters.instances[context.instance][context.side][context.groupId];
    return `<tr><th scope="row">Erhöhung Nr. 1008 VV RVG</th><td><input class="fee-value-input" type="text" inputmode="decimal" data-fee-value="${key}" value="${formatCent(parameter.feeValues.increase)}" aria-label="Gegenstandswert Erhöhung ${roman(context.instance)}. Instanz ${context.side === "claimant" ? "Klägerseite" : "Beklagtenseite"}"></td><td><output aria-label="Automatisch ermittelter Faktor Erhöhung Vertretungsgruppe ${context.groupId}">${formatFactor(factor)}</output></td><td>${formatCent(amountCent || 0)}</td></tr>`;
  }

  function vatRow(key, vatRate, vatCent) {
    const percent = (Number(vatRate) * 100).toLocaleString("de-DE", { maximumFractionDigits: 4 });
    return `<tr><th scope="row">Umsatzsteuer</th><td></td><td><input class="factor-input vat-input" type="text" inputmode="decimal" list="vat-rate-options" data-vat-rate="${key}" value="${percent}" placeholder="z.B. 19" aria-label="Umsatzsteuersatz in Prozent"></td><td>${formatCent(vatCent || 0)}</td></tr>`;
  }

  function editableRow(label, context, position, factor, amountCent, hearing = false) {
    const key = `${context.instance}:${context.side}:${position}:${context.groupId}`;
    const parameter = uiState.groupParameters.instances[context.instance][context.side][context.groupId];
    const value = parameter.feeValues[position];
    let factorCell;
    if (hearing) {
      factorCell = `<select data-hearing-factor="${context.instance}:${context.side}:${context.groupId}" aria-label="Faktor Terminsgebühr ${roman(context.instance)}. Instanz ${context.side === "claimant" ? "Klägerseite" : "Beklagtenseite"}">${hearingOptions(context.instance, parameter.hearingFactor)}</select>`;
    } else if (position === "procedure") {
      factorCell = `<output aria-label="Fest vorgegebener Faktor Verfahrensgebühr ${roman(context.instance)}. Instanz ${context.side === "claimant" ? "Klägerseite" : "Beklagtenseite"} Vertretungsgruppe ${context.groupId}">${formatFactor(parameter.procedureFactor)}</output>`;
    } else if (position === "settlement") {
      factorCell = `<output aria-label="Fest vorgegebener Faktor Einigungsgebühr ${roman(context.instance)}. Instanz ${context.side === "claimant" ? "Klägerseite" : "Beklagtenseite"} Vertretungsgruppe ${context.groupId}">${formatFactor(parameter.settlementFactor)}</output>`;
    } else {
      const factorField = "increaseFactor";
      factorCell = factorInput(`instance:${context.instance}:${context.side}:${context.groupId}:${factorField}`, parameter[factorField], `Faktor ${label} Vertretungsgruppe ${context.groupId}`);
    }
    const labelCell = position === "settlement" && context.side === "claimant"
      ? `<label>${escapeHtml(label)} <input type="checkbox" data-instance-settlement-enabled="${context.instance}" ${uiState.termination.instance === context.instance && uiState.termination.type === "comparison" ? "checked" : ""} aria-label="Verfahren in ${roman(context.instance)}. Instanz durch Vergleich vollständig beenden"></label>`
      : escapeHtml(label);
    return `<tr><th scope="row">${labelCell}</th><td><input class="fee-value-input" type="text" inputmode="decimal" data-fee-value="${key}" value="${formatCent(value)}" aria-label="Gegenstandswert ${escapeHtml(label)} ${roman(context.instance)}. Instanz ${context.side === "claimant" ? "Klägerseite" : "Beklagtenseite"}"></td><td>${factorCell}</td><td>${formatCent(amountCent || 0)}</td></tr>`;
  }


  function editablePretrialOtherExpensesRow(group) {
    const value = uiState.groupParameters.pretrial[group.groupId].otherExpensesCent;
    return `<tr><th scope="row">Sonstige Auslagen</th><td></td><td></td><td><input class="fee-value-input amount-input" type="text" inputmode="decimal" data-pretrial-other-expenses="${group.groupId}" value="${formatCent(value)}" aria-label="Sonstige Auslagen vorgerichtlich Vertretungsgruppe ${group.groupId}"></td></tr>`;
  }

  function editableOtherExpensesRow(context, amountCent) {
    const key = `${context.instance}:${context.side}:${context.groupId}`;
    const value = uiState.groupParameters.instances[context.instance][context.side][context.groupId].otherExpensesCent;
    return `<tr><th scope="row">Sonstige Auslagen</th><td></td><td></td><td><input class="fee-value-input amount-input" type="text" inputmode="decimal" data-other-expenses="${key}" value="${formatCent(value)}" aria-label="Sonstige Auslagen ${roman(context.instance)}. Instanz ${context.side === "claimant" ? "Klägerseite" : "Beklagtenseite"}"></td></tr>`;
  }

  function factorInput(key, value, label, disabled = false) {
    return `<input class="factor-input" type="number" min="0" max="5" step="0.1" data-group-factor="${key}" value="${Number(value).toFixed(1)}" aria-label="${escapeHtml(label)}">`;
  }

  function hearingOptions(instance, selected) {
    const values = instance === 3 ? [0, 0.8, 1.5] : [0, 0.5, 1.2];
    return values.map((v) => `<option value="${v}"${Number(selected) === v ? " selected" : ""}>${formatFactor(v)}</option>`).join("");
  }

  function rowWithCheckbox(label, valueCent, factor, amountCent, placement, checked, enabled, groupId) {
    const sideLabel = placement === "pretrial" ? "vorgerichtlich" : "in der ersten Instanz";
    return `<tr><th scope="row">${escapeHtml(label)} <input type="checkbox" data-credit-placement="${placement}" data-group-id="${groupId || ""}" ${checked ? "checked" : ""} ${enabled ? "" : "disabled"} aria-label="Anrechnung ${sideLabel} aktivieren"></th><td><input class="fee-value-input" type="text" inputmode="decimal" data-credit-value data-group-id="${groupId || ""}" value="${formatCent(valueCent)}" aria-label="Individueller Gegenstandswert für die Anrechnung ${sideLabel}"></td><td>${factor ? formatFactor(factor) : ""}</td><td>${amountCent ? formatCent(amountCent) : ""}</td></tr>`;
  }
  function row(label, valueCent, factor, amountCent, strong = false) { return `<tr${strong ? ' class="strong-row"' : ""}><th scope="row">${escapeHtml(label)}</th><td>${valueCent === null ? "" : formatCent(valueCent)}</td><td>${factor === null || factor === undefined ? "" : typeof factor === "string" ? factor : formatFactor(factor)}</td><td>${formatCent(amountCent || 0)}</td></tr>`; }
  function formatFactor(value) { return Number(value).toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 2 }); }
  function formatDate(value) { return new Intl.DateTimeFormat("de-DE").format(new Date(`${value}T00:00:00`)); }
  function roman(value) { return ["", "I", "II", "III"][value]; }
  function showStatus(message) { if (!elements.status) return; elements.status.textContent = message; elements.status.hidden = false; clearTimeout(showStatus.timer); showStatus.timer = setTimeout(() => { elements.status.hidden = true; }, 5000); }
  function showError(message) { elements.fehler.innerHTML = `<strong>Berechnung nicht möglich:</strong><p>${escapeHtml(message)}</p><p><a href="Instanzenrisiko_Startseite.html">Zur Eingabeseite</a></p>`; elements.fehler.hidden = false; elements.fehler.focus(); }
  function escapeHtml(value) { return String(value).replace(/[&<>"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character]); }
})(window);
