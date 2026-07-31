(function (global) {
  "use strict";

  function getInputState(inputStates, id) {
    const state = inputStates instanceof Map ? inputStates.get(id) : inputStates?.[id];
    return state || { entered: true, invalid: false };
  }

  /** Summiert gültige ganzzahlige Centbeträge, ohne die Positionen zu verändern. */
  function sumPositions(positions) {
    return (Array.isArray(positions) ? positions : []).reduce((sum, position) => {
      const amount = Number(position?.betragCent);
      return sum + (Number.isInteger(amount) && amount >= 0 ? amount : 0);
    }, 0);
  }

  /** Erkennt eine vollständig leere, noch nicht erfasste Eingabezeile. */
  function isEmptyPosition(position, inputState) {
    const state = inputState || { entered: true, invalid: false };
    return !String(position?.bezeichnung || "").trim()
      && state.entered === false
      && !state.invalid;
  }

  /** Entfernt ausschließlich vollständig leere Positionen am Listenende und liefert eine neue Liste. */
  function removeEmptyTrailingPositions(positions, inputStates) {
    const result = (Array.isArray(positions) ? positions : []).map((position) => ({ ...position }));
    while (result.length) {
      const last = result.at(-1);
      if (!isEmptyPosition(last, getInputState(inputStates, last.id))) break;
      result.pop();
    }
    return result.map((position, index) => ({ ...position, nummer: index + 1 }));
  }

  /** Validiert Einzelpositionen und liefert maschinenlesbare Fehler mit deutscher Meldung. */
  function validatePositions(positions, inputStates) {
    const errors = [];
    const list = Array.isArray(positions) ? positions : [];
    list.forEach((position, index) => {
      const state = getInputState(inputStates, position?.id);
      if (index === list.length - 1 && isEmptyPosition(position, state)) return;
      const number = Number.isInteger(position?.nummer) ? position.nummer : index + 1;
      if (!String(position?.bezeichnung || "").trim()) {
        errors.push({ code: "missing-label", field: "bezeichnung", index, number, message: `Die Bezeichnung des Teilstreitwerts ${number} fehlt.` });
      }
      if (!state.entered || state.invalid || !Number.isInteger(position?.betragCent) || position.betragCent < 0) {
        errors.push({ code: "invalid-amount", field: "betragCent", index, number, message: `Der Betrag des Teilstreitwerts ${number} ist ungültig.` });
      }
    });
    return { valid: errors.length === 0, errors };
  }

  /** Validiert den Gesamtwert und – im Teilwertmodus – sämtliche relevanten Einzelpositionen. */
  function validateStreitwert(streitwert, inputStates) {
    const source = streitwert && typeof streitwert === "object" ? streitwert : {};
    const errors = [];
    if (!Number.isInteger(source.gesamtCent) || source.gesamtCent < 0) {
      errors.push({ code: "invalid-total", field: "gesamtCent", message: "Der Gesamtstreitwert ist ungültig." });
    }
    if (source.modus === "teilwerte") errors.push(...validatePositions(source.teilwerte, inputStates).errors);
    return { valid: errors.length === 0, errors };
  }

  /** Erstellt eine speicherfähige Kopie ohne UI-Status und berechnet bei Einzelpositionen die Summe neu. */
  function prepareForStorage(streitwert, inputStates) {
    const source = streitwert && typeof streitwert === "object" ? streitwert : {};
    const result = {
      modus: source.modus === "teilwerte" ? "teilwerte" : "gesamt",
      gesamtCent: Number.isInteger(source.gesamtCent) && source.gesamtCent >= 0 ? source.gesamtCent : 0,
      teilwerte: removeEmptyTrailingPositions(source.teilwerte, inputStates)
    };
    if (result.modus === "teilwerte") result.gesamtCent = sumPositions(result.teilwerte);
    return result;
  }

  global.InstanzenrisikoStreitwert = Object.freeze({
    sumPositions,
    isEmptyPosition,
    removeEmptyTrailingPositions,
    validatePositions,
    validateStreitwert,
    prepareForStorage
  });
})(window);
