(function (global) {
  "use strict";

  const { formatCent, parseGermanMoneyToCent, createStableId, clampInteger } = global.FormUtils;
  const text = (key, parameters) => global.InstanzenrisikoText?.get(key, parameters) ?? key;

  const state = {
    streitwert: {
      modus: "gesamt",
      gesamtCent: 0,
      teilwerte: []
    },
    klaegerseite: createDefaultPartyState(),
    beklagtenseite: createDefaultPartyState(),
    vorgerichtlicheTaetigkeitKlaeger: false
  };

  const changeCallbacks = new Set();
  const partialAmountState = new Map();
  const MODULE_NAME = "instanzenrisiko";
  const AUTOSAVE_DELAY = 300;
  let elements;
  let activeCaseId = null;
  let autosaveSuppressed = false;
  let autosaveTimer = null;
  let statusTimer = null;
  let hasUnsavedChanges = false;

  document.addEventListener("DOMContentLoaded", init);

  function createDefaultPartyState() {
    return {
      anzahlPersonen: 1,
      vertretungsart: "einzeln",
      gruppen: [{ person: 1, gruppe: 1 }],
      anzahlProzessbevollmaechtigte: 1
    };
  }

  function init() {
    global.InstanzenrisikoText?.apply();
    elements = {
      form: document.getElementById("instanzenrisikoForm"),
      gesamtstreitwert: document.getElementById("gesamtstreitwert"),
      gesamtstreitwertLeeren: document.getElementById("gesamtstreitwertLeeren"),
      teilstreitwertHinzufuegen: document.getElementById("teilstreitwertHinzufuegen"),
      teilstreitwerteBereich: document.getElementById("teilstreitwerteBereich"),
      teilstreitwerteTabelle: document.getElementById("teilstreitwerteTabelle"),
      weiterePosition: document.getElementById("weiterePosition"),
      gesamtstreitwertFehler: document.getElementById("gesamtstreitwertFehler"),
      anzahlKlaeger: document.getElementById("anzahlKlaeger"),
      anzahlBeklagte: document.getElementById("anzahlBeklagte"),
      klaegerVertretung: document.getElementById("klaegerVertretung"),
      beklagteVertretung: document.getElementById("beklagteVertretung"),
      klaegerVertretungInhalt: document.getElementById("klaegerVertretungInhalt"),
      beklagteVertretungInhalt: document.getElementById("beklagteVertretungInhalt"),
      vorgerichtlicheTaetigkeitKlaeger: document.getElementById("vorgerichtlicheTaetigkeitKlaeger"),
      formularFehler: document.getElementById("formularFehler"),
      formularZuruecksetzen: document.getElementById("formularZuruecksetzen"),
      datenPruefen: document.getElementById("datenPruefen"),
      instanzenrisikoBerechnen: document.getElementById("instanzenrisikoBerechnen"),
      datenVorschauBereich: document.getElementById("datenVorschauBereich"),
      datenVorschau: document.getElementById("datenVorschau"),
      autosaveStatus: document.getElementById("autosaveStatus")
    };

    bindEvents();
    render();
    exposePublicApi();
    initializeDraftStorage();
  }

  function bindEvents() {
    elements.gesamtstreitwert.addEventListener("focus", handleMoneyFocus);
    elements.gesamtstreitwert.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      elements.gesamtstreitwert.blur();
    });
    elements.gesamtstreitwert.addEventListener("blur", handleTotalBlur);
    elements.gesamtstreitwert.addEventListener("input", clearTotalError);
    elements.gesamtstreitwertLeeren.addEventListener("click", clearTotal);
    elements.teilstreitwertHinzufuegen.addEventListener("click", activatePartialMode);
    elements.weiterePosition.addEventListener("click", () => addPartialValue());

    elements.anzahlKlaeger.addEventListener("change", () => updatePartyCount("klaegerseite"));
    elements.anzahlBeklagte.addEventListener("change", () => updatePartyCount("beklagtenseite"));

    elements.vorgerichtlicheTaetigkeitKlaeger.addEventListener("change", () => {
      state.vorgerichtlicheTaetigkeitKlaeger = elements.vorgerichtlicheTaetigkeitKlaeger.value === "true";
      emitChange();
    });

    elements.formularZuruecksetzen.addEventListener("click", () => reset({ clearStorage: true }));
    elements.datenPruefen.addEventListener("click", showValidatedPreview);
    elements.instanzenrisikoBerechnen.addEventListener("click", calculateInstanzenrisiko);
  }

  function handleMoneyFocus(event) {
    const cent = parseGermanMoneyToCent(event.target.value);
    event.target.value = cent === null ? "" : (cent / 100).toFixed(2).replace(".", ",");
    event.target.select();
  }

  function handleTotalBlur() {
    if (state.streitwert.modus !== "gesamt") return;
    const cent = parseGermanMoneyToCent(elements.gesamtstreitwert.value);
    if (cent === null || cent < 0) {
      showTotalError("Bitte geben Sie einen gültigen, nicht negativen Geldbetrag ein.");
      return;
    }
    state.streitwert.gesamtCent = cent;
    elements.gesamtstreitwert.value = formatCent(cent);
    clearTotalError();
    emitChange();
  }

  function clearTotal() {
    if (state.streitwert.modus !== "gesamt") return;
    state.streitwert.gesamtCent = 0;
    elements.gesamtstreitwert.value = formatCent(0);
    clearTotalError();
    emitChange();
    elements.gesamtstreitwert.focus();
  }

  function activatePartialMode() {
    if (state.streitwert.modus === "teilwerte") {
      addPartialValue();
      return;
    }

    const parsed = parseGermanMoneyToCent(elements.gesamtstreitwert.value);
    const initialCent = parsed !== null && parsed >= 0 ? parsed : 0;
    state.streitwert.modus = "teilwerte";
    state.streitwert.teilwerte = [{
      id: createStableId(),
      nummer: 1,
      bezeichnung: "Klageantrag Ziff. 1",
      betragCent: initialCent
    }];
    partialAmountState.set(state.streitwert.teilwerte[0].id, { entered: true, invalid: false });
    recalculateTotal();
    renderStreitwert();
    emitChange();

    requestAnimationFrame(() => {
      const firstLabel = elements.teilstreitwerteTabelle.querySelector("input[data-field='bezeichnung']");
      firstLabel?.focus();
    });
  }

  function addPartialValue(options = {}) {
    const { empty = false } = options;
    if (state.streitwert.modus !== "teilwerte") {
      activatePartialMode();
      return;
    }

    const lastItem = state.streitwert.teilwerte.at(-1);
    if (lastItem && !lastItem.bezeichnung.trim() && partialAmountState.get(lastItem.id)?.entered === false) {
      focusPartialField(lastItem.id, "bezeichnung");
      return;
    }

    const nextNumber = state.streitwert.teilwerte.length + 1;
    const nextItem = {
      id: createStableId(),
      nummer: nextNumber,
      bezeichnung: empty ? "" : `Klageantrag Ziff. ${nextNumber}`,
      betragCent: 0
    };
    state.streitwert.teilwerte.push(nextItem);
    partialAmountState.set(nextItem.id, { entered: !empty, invalid: false });
    renumberPartialValues();
    renderStreitwert();
    emitChange();
    focusPartialField(nextItem.id, "bezeichnung");
  }

  function focusPartialField(id, field) {
    requestAnimationFrame(() => {
      const row = elements.teilstreitwerteTabelle.querySelector(`tr[data-id="${CSS.escape(id)}"]`);
      row?.querySelector(`input[data-field="${field}"]`)?.focus();
    });
  }

  function removePartialValue(id) {
    const removed = state.streitwert.teilwerte.find((item) => item.id === id);
    state.streitwert.teilwerte = state.streitwert.teilwerte.filter((item) => item.id !== id);
    partialAmountState.delete(id);

    if (state.streitwert.teilwerte.length === 0) {
      state.streitwert.modus = "gesamt";
      state.streitwert.gesamtCent = removed?.betragCent ?? state.streitwert.gesamtCent;
    } else {
      renumberPartialValues();
      recalculateTotal();
    }

    renderStreitwert();
    emitChange();
  }

  function updatePartialValue(id, field, rawValue) {
    const item = state.streitwert.teilwerte.find((entry) => entry.id === id);
    if (!item) return;

    if (field === "bezeichnung") {
      item.bezeichnung = rawValue;
    }

    emitChange();
  }

  function commitPartialAmount(id, input) {
    const item = state.streitwert.teilwerte.find((entry) => entry.id === id);
    if (!item) return false;
    if (input.value.trim() === "" && !item.bezeichnung.trim()) {
      partialAmountState.set(id, { entered: false, invalid: false });
      input.removeAttribute("aria-invalid");
      input.closest("td")?.querySelector(".field-error")?.setAttribute("hidden", "");
      return true;
    }
    const parsed = parseGermanMoneyToCent(input.value);
    if (input.value.trim() === "" || parsed === null || parsed < 0) {
      partialAmountState.set(id, { entered: input.value.trim() !== "", invalid: true });
      input.setAttribute("aria-invalid", "true");
      input.closest("td")?.querySelector(".field-error")?.removeAttribute("hidden");
      return false;
    }
    item.betragCent = parsed;
    partialAmountState.set(id, { entered: true, invalid: false });
    input.removeAttribute("aria-invalid");
    input.closest("td")?.querySelector(".field-error")?.setAttribute("hidden", "");
    input.value = formatCent(parsed);
    recalculateTotal();
    elements.gesamtstreitwert.value = formatCent(state.streitwert.gesamtCent);
    emitChange();
    return true;
  }

  function renumberPartialValues() {
    state.streitwert.teilwerte.forEach((item, index) => {
      item.nummer = index + 1;
    });
  }

  function recalculateTotal() {
    state.streitwert.gesamtCent = state.streitwert.teilwerte.reduce((sum, item) => sum + item.betragCent, 0);
  }

  function updatePartyCount(side) {
    const input = side === "klaegerseite" ? elements.anzahlKlaeger : elements.anzahlBeklagte;
    const count = clampInteger(input.value, 1, 99);
    input.value = String(count);

    const party = state[side];
    party.anzahlPersonen = count;

    if (count === 1) {
      party.vertretungsart = "einzeln";
      party.gruppen = [{ person: 1, gruppe: 1 }];
      party.anzahlProzessbevollmaechtigte = 1;
    } else if (count === 2) {
      party.vertretungsart = "gemeinsam";
      party.gruppen = [{ person: 1, gruppe: 1 }, { person: 2, gruppe: 1 }];
      party.anzahlProzessbevollmaechtigte = 1;
    } else {
      party.vertretungsart = "alle_gemeinsam";
      party.gruppen = Array.from({ length: count }, (_, index) => ({ person: index + 1, gruppe: 1 }));
      party.anzahlProzessbevollmaechtigte = 1;
    }

    renderParty(side);
    emitChange();
  }

  function setRepresentation(side, representation) {
    const party = state[side];
    party.vertretungsart = representation;

    if (representation === "gemeinsam" || representation === "alle_gemeinsam") {
      party.gruppen = Array.from({ length: party.anzahlPersonen }, (_, index) => ({ person: index + 1, gruppe: 1 }));
    } else if (representation === "getrennt" || representation === "jeder_eigen") {
      party.gruppen = Array.from({ length: party.anzahlPersonen }, (_, index) => ({ person: index + 1, gruppe: index + 1 }));
    } else if (representation === "teilweise_gemeinsam") {
      party.gruppen = Array.from({ length: party.anzahlPersonen }, (_, index) => ({ person: index + 1, gruppe: index < 2 ? 1 : 2 }));
    }

    updateRepresentativeCount(party);
    renderParty(side);
    emitChange();
  }

  function setPersonGroup(side, person, group) {
    const party = state[side];
    const target = party.gruppen.find((entry) => entry.person === person);
    if (!target) return;
    target.gruppe = clampInteger(group, 1, party.anzahlPersonen);
    normalizeGroups(party);
    updateRepresentativeCount(party);
    renderParty(side);
    emitChange();
  }

  function normalizeGroups(party) {
    const usedGroups = [...new Set(party.gruppen.map((entry) => entry.gruppe))].sort((a, b) => a - b);
    const mapping = new Map(usedGroups.map((group, index) => [group, index + 1]));
    party.gruppen.forEach((entry) => {
      entry.gruppe = mapping.get(entry.gruppe);
    });
  }

  function updateRepresentativeCount(party) {
    party.anzahlProzessbevollmaechtigte = new Set(party.gruppen.map((entry) => entry.gruppe)).size;
  }

  function render() {
    renderStreitwert();
    elements.anzahlKlaeger.value = String(state.klaegerseite.anzahlPersonen);
    elements.anzahlBeklagte.value = String(state.beklagtenseite.anzahlPersonen);
    renderParty("klaegerseite");
    renderParty("beklagtenseite");
    elements.vorgerichtlicheTaetigkeitKlaeger.value = String(state.vorgerichtlicheTaetigkeitKlaeger);
  }

  function renderStreitwert() {
    const partialMode = state.streitwert.modus === "teilwerte";
    elements.gesamtstreitwert.readOnly = partialMode;
    elements.gesamtstreitwert.classList.toggle("readonly-input", partialMode);
    elements.gesamtstreitwert.value = formatCent(state.streitwert.gesamtCent);
    elements.gesamtstreitwertLeeren.disabled = partialMode;
    elements.teilstreitwerteBereich.hidden = !partialMode;

    elements.teilstreitwerteTabelle.replaceChildren();
    if (!partialMode) return;

    state.streitwert.teilwerte.forEach((item) => {
      if (!partialAmountState.has(item.id)) partialAmountState.set(item.id, { entered: true, invalid: false });
      const row = document.createElement("tr");
      row.dataset.id = item.id;

      const numberCell = document.createElement("td");
      numberCell.textContent = String(item.nummer);
      numberCell.className = "number-column";

      const labelCell = document.createElement("td");
      const labelInput = document.createElement("input");
      labelInput.type = "text";
      labelInput.value = item.bezeichnung;
      labelInput.setAttribute("list", "teilstreitwertBezeichnungen");
      labelInput.dataset.field = "bezeichnung";
      labelInput.setAttribute("aria-label", `Bezeichnung Teilstreitwert ${item.nummer}`);
      labelInput.addEventListener("input", (event) => {
        event.target.removeAttribute("aria-invalid");
        updatePartialValue(item.id, "bezeichnung", event.target.value);
      });
      labelInput.addEventListener("keydown", (event) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        row.querySelector("input[data-field='betragCent']")?.focus();
      });
      labelCell.append(labelInput);

      const amountCell = document.createElement("td");
      const amountInput = document.createElement("input");
      amountInput.type = "text";
      amountInput.inputMode = "decimal";
      const amountStatus = partialAmountState.get(item.id);
      amountInput.value = amountStatus.entered ? formatCent(item.betragCent) : "";
      amountInput.className = "money-input table-money-input";
      amountInput.dataset.field = "betragCent";
      amountInput.setAttribute("aria-label", `Betrag Teilstreitwert ${item.nummer}`);
      const amountErrorId = `teilstreitwert-betrag-fehler-${item.id}`;
      amountInput.setAttribute("aria-describedby", amountErrorId);
      if (amountStatus.invalid) amountInput.setAttribute("aria-invalid", "true");
      amountInput.addEventListener("focus", handleMoneyFocus);
      amountInput.addEventListener("input", () => {
        amountInput.removeAttribute("aria-invalid");
        amountCell.querySelector(".field-error")?.setAttribute("hidden", "");
      });
      amountInput.addEventListener("keydown", (event) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        if (!item.bezeichnung.trim()) {
          labelInput.setAttribute("aria-invalid", "true");
          labelInput.focus();
          return;
        }
        if (!commitPartialAmount(item.id, amountInput)) {
          amountInput.focus();
          return;
        }
        amountInput.dataset.skipBlurCommit = "true";
        addPartialValue({ empty: true });
      });
      amountInput.addEventListener("blur", (event) => {
        if (event.target.dataset.skipBlurCommit === "true") return;
        commitPartialAmount(item.id, event.target);
      });
      amountCell.append(amountInput);
      const amountError = document.createElement("p");
      amountError.id = amountErrorId;
      amountError.className = "field-error";
      amountError.textContent = "Bitte geben Sie einen gültigen, nicht negativen Betrag ein.";
      amountError.hidden = !amountStatus.invalid;
      amountCell.append(amountError);

      const actionCell = document.createElement("td");
      actionCell.className = "action-column";
      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "icon-button danger-icon-button";
      deleteButton.textContent = "×";
      deleteButton.title = "Teilstreitwert entfernen";
      deleteButton.setAttribute("aria-label", `Teilstreitwert ${item.nummer} entfernen`);
      deleteButton.addEventListener("click", () => removePartialValue(item.id));
      actionCell.append(deleteButton);

      row.append(numberCell, labelCell, amountCell, actionCell);
      elements.teilstreitwerteTabelle.append(row);
    });
  }

  function renderParty(side) {
    const isPlaintiff = side === "klaegerseite";
    const party = state[side];
    const panel = isPlaintiff ? elements.klaegerVertretung : elements.beklagteVertretung;
    const container = isPlaintiff ? elements.klaegerVertretungInhalt : elements.beklagteVertretungInhalt;
    const prefix = isPlaintiff ? "klaeger" : "beklagte";

    panel.hidden = party.anzahlPersonen <= 1;
    container.replaceChildren();
    if (party.anzahlPersonen <= 1) return;

    const fieldset = document.createElement("fieldset");
    fieldset.className = "choice-group";
    const legend = document.createElement("legend");
    legend.textContent = party.anzahlPersonen === 2 ? "Gemeinsamer Rechtsanwalt?" : "Vertretung";
    fieldset.append(legend);

    const choices = party.anzahlPersonen === 2
      ? [
          ["gemeinsam", "Ja"],
          ["getrennt", "Nein"]
        ]
      : [
          ["alle_gemeinsam", "Alle gemeinsam"],
          ["jeder_eigen", "Jeder mit eigenem Rechtsanwalt"],
          ["teilweise_gemeinsam", "Teilweise gemeinsam"]
        ];

    choices.forEach(([value, label]) => {
      const option = document.createElement("label");
      option.className = "radio-option";
      const radio = document.createElement("input");
      radio.type = "radio";
      radio.name = `${prefix}Vertretungsart`;
      radio.value = value;
      radio.checked = party.vertretungsart === value;
      radio.addEventListener("change", () => setRepresentation(side, value));
      option.append(radio, document.createTextNode(label));
      fieldset.append(option);
    });

    container.append(fieldset);

    if (party.vertretungsart === "teilweise_gemeinsam") {
      container.append(createGroupAssignment(side, party));
    }

    const result = document.createElement("p");
    result.className = "calculated-result";
    result.textContent = `Ermittelte Prozessbevollmächtigte: ${party.anzahlProzessbevollmaechtigte}`;
    container.append(result);
  }

  function createGroupAssignment(side, party) {
    const wrapper = document.createElement("div");
    wrapper.className = "group-assignment";

    const title = document.createElement("h4");
    title.textContent = "Zuordnung zu Vertretungsgruppen";
    wrapper.append(title);

    party.gruppen.forEach((entry) => {
      const row = document.createElement("div");
      row.className = "group-row";
      const label = document.createElement("label");
      const selectId = `${side}-person-${entry.person}-gruppe`;
      label.htmlFor = selectId;
      label.textContent = `Person ${entry.person}`;

      const select = document.createElement("select");
      select.id = selectId;
      select.name = selectId;
      for (let group = 1; group <= party.anzahlPersonen; group += 1) {
        const option = document.createElement("option");
        option.value = String(group);
        option.textContent = `Gruppe ${group}`;
        option.selected = entry.gruppe === group;
        select.append(option);
      }
      select.addEventListener("change", () => setPersonGroup(side, entry.person, select.value));
      row.append(label, select);
      wrapper.append(row);
    });

    return wrapper;
  }

  function validate() {
    const errors = [];

    if (!Number.isInteger(state.streitwert.gesamtCent) || state.streitwert.gesamtCent < 0) {
      errors.push("Der Gesamtstreitwert ist ungültig.");
    }

    if (state.streitwert.modus === "teilwerte") {
      state.streitwert.teilwerte.forEach((item, index) => {
        const amountStatus = partialAmountState.get(item.id) || { entered: true, invalid: false };
        const ignorableTrailingRow = index === state.streitwert.teilwerte.length - 1
          && !item.bezeichnung.trim() && amountStatus.entered === false && !amountStatus.invalid;
        if (ignorableTrailingRow) return;
        if (!item.bezeichnung.trim()) {
          errors.push(`Die Bezeichnung des Teilstreitwerts ${item.nummer} fehlt.`);
        }
        if (!amountStatus.entered || amountStatus.invalid || !Number.isInteger(item.betragCent) || item.betragCent < 0) {
          errors.push(`Der Betrag des Teilstreitwerts ${item.nummer} ist ungültig.`);
        }
      });
    }

    ["klaegerseite", "beklagtenseite"].forEach((side) => {
      const party = state[side];
      if (!Number.isInteger(party.anzahlPersonen) || party.anzahlPersonen < 1 || party.anzahlPersonen > 99) {
        errors.push(`Die Personenzahl auf der ${side === "klaegerseite" ? "Klägerseite" : "Beklagtenseite"} ist ungültig.`);
      }
      const sideLabel = side === "klaegerseite" ? "Klägerseite" : "Beklagtenseite";
      const assignments = Array.isArray(party.gruppen) ? party.gruppen : [];
      const personCounts = new Map();
      assignments.forEach((entry) => {
        const person = Number(entry.person);
        const group = Number(entry.gruppe);
        personCounts.set(person, (personCounts.get(person) || 0) + 1);
        if (!Number.isInteger(person) || person < 1 || person > party.anzahlPersonen) errors.push(`Die Vertretungszuordnung auf der ${sideLabel} enthält eine unbekannte Person.`);
        if (!Number.isInteger(group) || group < 1 || group > party.anzahlPersonen) errors.push(`Die Vertretungszuordnung auf der ${sideLabel} enthält eine ungültige Gruppen-ID.`);
      });
      for (let person = 1; person <= party.anzahlPersonen; person += 1) {
        const count = personCounts.get(person) || 0;
        if (count === 0) errors.push(`Person ${person} auf der ${sideLabel} ist keiner Vertretungsgruppe zugeordnet.`);
        if (count > 1) errors.push(`Person ${person} auf der ${sideLabel} ist mehrfach zugeordnet.`);
      }
      if (assignments.length !== party.anzahlPersonen || party.anzahlProzessbevollmaechtigte < 1) {
        errors.push(`Die Vertretungszuordnung auf der ${sideLabel} ist unvollständig.`);
      }
    });

    return { valid: errors.length === 0, errors };
  }

  function showValidatedPreview() {
    const result = validate();
    if (!result.valid) {
      elements.formularFehler.innerHTML = `<strong>Bitte korrigieren Sie folgende Angaben:</strong><ul>${result.errors.map((error) => `<li>${escapeHtml(error)}</li>`).join("")}</ul>`;
      elements.formularFehler.hidden = false;
      elements.formularFehler.focus();
      elements.datenVorschauBereich.hidden = true;
      return;
    }

    elements.formularFehler.hidden = true;
    elements.datenVorschau.textContent = JSON.stringify(getData(), null, 2);
    elements.datenVorschauBereich.hidden = false;
    elements.datenVorschauBereich.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function calculateInstanzenrisiko() {
    const result = validate();
    if (!result.valid) {
      elements.formularFehler.innerHTML = `<strong>Bitte korrigieren Sie folgende Angaben:</strong><ul>${result.errors.map((error) => `<li>${escapeHtml(error)}</li>`).join("")}</ul>`;
      elements.formularFehler.hidden = false;
      elements.formularFehler.focus();
      return;
    }
    elements.formularFehler.hidden = true;
    hasUnsavedChanges = true;
    const saved = saveCurrentDraft({ silent: true, resetOutputToDefaults: true });
    if (!saved) {
      showStatus("Die Eingaben konnten nicht gespeichert werden.");
      return;
    }
    global.location.href = "Instanzenrisiko_Ausgabe.html";
  }

  function getData() {
    const data = structuredCloneSafe(state);
    if (data.streitwert.modus === "teilwerte") {
      while (data.streitwert.teilwerte.length) {
        const last = data.streitwert.teilwerte.at(-1);
        const amountStatus = partialAmountState.get(last.id);
        if (last.bezeichnung.trim() || amountStatus?.entered !== false || amountStatus?.invalid) break;
        data.streitwert.teilwerte.pop();
      }
      data.streitwert.teilwerte.forEach((item, index) => { item.nummer = index + 1; });
    }
    return data;
  }

  function setData(data) {
    if (!data || typeof data !== "object") {
      throw new TypeError("setData erwartet ein Datenobjekt.");
    }

    const next = structuredCloneSafe(data);
    partialAmountState.clear();
    Object.assign(state.streitwert, next.streitwert || {});
    Object.assign(state.klaegerseite, next.klaegerseite || {});
    Object.assign(state.beklagtenseite, next.beklagtenseite || {});
    state.vorgerichtlicheTaetigkeitKlaeger = Boolean(next.vorgerichtlicheTaetigkeitKlaeger);
    state.streitwert.teilwerte.forEach((item) => partialAmountState.set(item.id, { entered: true, invalid: false }));

    renumberPartialValues();
    if (state.streitwert.modus === "teilwerte") recalculateTotal();
    updateRepresentativeCount(state.klaegerseite);
    updateRepresentativeCount(state.beklagtenseite);
    render();
    emitChange();
  }

  function reset(options = {}) {
    const { clearStorage = false } = options;
    autosaveSuppressed = true;
    clearTimeout(autosaveTimer);
    state.streitwert = { modus: "gesamt", gesamtCent: 0, teilwerte: [] };
    partialAmountState.clear();
    state.klaegerseite = createDefaultPartyState();
    state.beklagtenseite = createDefaultPartyState();
    state.vorgerichtlicheTaetigkeitKlaeger = false;
    elements.formularFehler.hidden = true;
    elements.datenVorschauBereich.hidden = true;
    render();
    emitChange();
    if (clearStorage) clearSavedDraft();
    queueMicrotask(() => {
      autosaveSuppressed = false;
    });
    elements.gesamtstreitwert.focus();
  }

  function onChange(callback) {
    if (typeof callback !== "function") {
      throw new TypeError("onChange erwartet eine Funktion.");
    }
    changeCallbacks.add(callback);
    return () => changeCallbacks.delete(callback);
  }

  function emitChange() {
    const data = getData();
    changeCallbacks.forEach((callback) => callback(data));
    document.dispatchEvent(new CustomEvent("streitwertdatenGeaendert", { detail: data }));
    if (!autosaveSuppressed) hasUnsavedChanges = true;
    scheduleAutosave();
  }

  function scheduleAutosave() {
    if (autosaveSuppressed || !activeCaseId) return;
    clearTimeout(autosaveTimer);
    autosaveTimer = global.setTimeout(saveCurrentDraft, AUTOSAVE_DELAY);
  }

  function saveCurrentDraft(options = {}) {
    if (autosaveSuppressed || !activeCaseId || !global.KostenassistentStorage || !hasUnsavedChanges) return false;
    clearTimeout(autosaveTimer);
    const nextData = getData();
    const previousModule = global.KostenassistentStorage.loadCaseModule(activeCaseId, MODULE_NAME);
    const nextValueCent = nextData.streitwert?.gesamtCent || 0;
    let nextOutput = previousModule?.ausgabe;
    if (options.resetOutputToDefaults) nextOutput = createInitialOutputState(nextData, nextValueCent);
    const saved = global.KostenassistentStorage.updateCaseModule(activeCaseId, MODULE_NAME, {
      ...(previousModule || {}),
      version: 1,
      savedAt: new Date().toISOString(),
      data: nextData,
      ...(nextOutput ? { ausgabe: nextOutput } : {})
    });
    if (saved) {
      hasUnsavedChanges = false;
      if (!options.silent) showStatus("Eingaben automatisch gespeichert.");
    }
    return saved;
  }

  function createInitialOutputState(data, valueCent) {
    const positions = ["procedure", "increase", "hearing", "settlement"];
    const feeValues = {};
    [1, 2, 3].forEach((instance) => {
      feeValues[instance] = {};
      ["claimant", "defendant"].forEach((side) => {
        feeValues[instance][side] = Object.fromEntries(positions.map((position) => [position, valueCent]));
      });
    });
    const pretrialEnabled = Boolean(data.vorgerichtlicheTaetigkeitKlaeger);
    return {
      effectiveDate: data.rechtsstand || "2025-06-01",
      termination: { instance: 0, type: "" },
      pretrialEnabled,
      creditPlacement: pretrialEnabled ? "instance" : "none",
      creditValueCent: valueCent,
      feeValues,
      hearingFactors: {
        1: { claimant: 1.2, defendant: 1.2 },
        2: { claimant: 1.2, defendant: 1.2 },
        3: { claimant: 1.5, defendant: 1.5 }
      },
      courtFactors: { 1: 3, 2: 4, 3: 5 },
      businessFactor: 1.3,
      pretrialEffectiveDate: null,
      otherExpenses: {
        1: { claimant: 0, defendant: 0 },
        2: { claimant: 0, defendant: 0 },
        3: { claimant: 0, defendant: 0 }
      },
      groupParameters: {
        pretrial: {},
        instances: {
          1: { claimant: {}, defendant: {} },
          2: { claimant: {}, defendant: {} },
          3: { claimant: {}, defendant: {} }
        }
      }
    };
  }

  function restoreSavedDraft() {
    if (!activeCaseId || !global.KostenassistentStorage) return false;
    const stored = global.KostenassistentStorage.loadCaseModule(activeCaseId, MODULE_NAME);
    if (!stored || stored.version !== 1 || !stored.data) return false;
    autosaveSuppressed = true;
    try {
      setData(stored.data);
      hasUnsavedChanges = false;
      showStatus("Gespeicherte Eingaben wurden wiederhergestellt.");
      return true;
    } catch (error) {
      console.warn("Kostenassistent: Gespeicherte Instanzenrisiko-Daten konnten nicht wiederhergestellt werden.", error);
      return false;
    } finally {
      queueMicrotask(() => {
        autosaveSuppressed = false;
      });
    }
  }

  function clearSavedDraft() {
    if (!activeCaseId || !global.KostenassistentStorage) return false;
    const cleared = global.KostenassistentStorage.clearCaseModule(activeCaseId, MODULE_NAME);
    if (cleared) {
      hasUnsavedChanges = false;
      showStatus("Gespeicherte Eingaben wurden gelöscht.");
    }
    return cleared;
  }

  function initializeDraftStorage() {
    if (!global.KostenassistentStorage) {
      console.warn("Kostenassistent: Die Speicherkomponente wurde nicht geladen.");
      return;
    }
    const activeCase = global.KostenassistentStorage.ensureActiveCase();
    activeCaseId = activeCase?.fallId || null;
    restoreSavedDraft();
    global.addEventListener("pagehide", () => saveCurrentDraft({ silent: true }));
  }

  function showStatus(message) {
    if (!elements.autosaveStatus) return;
    clearTimeout(statusTimer);
    elements.autosaveStatus.textContent = message;
    elements.autosaveStatus.hidden = false;
    statusTimer = global.setTimeout(() => {
      elements.autosaveStatus.hidden = true;
      elements.autosaveStatus.textContent = "";
    }, 3000);
  }

  function exposePublicApi() {
    global.InstanzenrisikoForm = Object.freeze({
      getData,
      setData,
      validate,
      reset,
      onChange,
      saveCurrentDraft,
      restoreSavedDraft,
      clearSavedDraft,
      initializeDraftStorage
    });
    global.getData = getData;
    global.setData = setData;
    global.validate = validate;
    global.reset = reset;
    global.onChange = onChange;
    global.saveCurrentDraft = saveCurrentDraft;
    global.restoreSavedDraft = restoreSavedDraft;
    global.clearSavedDraft = clearSavedDraft;
    global.initializeDraftStorage = initializeDraftStorage;
  }

  function structuredCloneSafe(value) {
    if (typeof global.structuredClone === "function") return global.structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  function showTotalError(message) {
    elements.gesamtstreitwertFehler.textContent = message;
    elements.gesamtstreitwertFehler.hidden = false;
    elements.gesamtstreitwert.setAttribute("aria-invalid", "true");
  }

  function clearTotalError() {
    elements.gesamtstreitwertFehler.hidden = true;
    elements.gesamtstreitwert.removeAttribute("aria-invalid");
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
})(window);
