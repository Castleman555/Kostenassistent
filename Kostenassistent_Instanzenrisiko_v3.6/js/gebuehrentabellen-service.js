(function (global) {
  "use strict";

  const PATHS = Object.freeze({
    GKG: "data/gkg-gebuehrentabellen.json",
    RVG: "data/rvg-gebuehrentabellen.json"
  });

  let cache = null;

  function validateDocument(document, expectedType) {
    if (!document || document.schemaVersion !== 1 || document.type !== expectedType || !Array.isArray(document.versions)) {
      throw new Error(`Ungültige ${expectedType}-Gebührendatei.`);
    }
    document.versions.forEach((version) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(version.effectiveFrom) || !Array.isArray(version.entries) || version.entries.length === 0) {
        throw new Error(`Ungültiger Rechtsstand in der ${expectedType}-Gebührendatei.`);
      }
      let previous = -1;
      version.entries.forEach((entry) => {
        if (!Number.isInteger(entry.valueLimitCent) || !Number.isInteger(entry.feeCent) || entry.valueLimitCent <= previous || entry.feeCent < 0) {
          throw new Error(`Ungültige oder nicht aufsteigende ${expectedType}-Gebührentabelle ${version.sourceSheet}.`);
        }
        previous = entry.valueLimitCent;
      });
    });
    return document;
  }

  async function fetchJson(path) {
    const response = await fetch(path, { cache: "no-store" });
    if (!response.ok) throw new Error(`${path} konnte nicht geladen werden (${response.status}).`);
    return response.json();
  }

  async function load() {
    if (cache) return cache;
    try {
      const [gkg, rvg] = await Promise.all([fetchJson(PATHS.GKG), fetchJson(PATHS.RVG)]);
      cache = Object.freeze({ GKG: validateDocument(gkg, "GKG"), RVG: validateDocument(rvg, "RVG") });
      return cache;
    } catch (error) {
      console.error("Kostenassistent: Gebührentabellen konnten nicht geladen werden.", error);
      const wrapped = new Error("Die Gebührentabellen konnten nicht geladen werden. Starten Sie die Anwendung über einen lokalen Webserver.");
      wrapped.cause = error;
      throw wrapped;
    }
  }

  function selectVersion(document, effectiveDate) {
    const selected = [...document.versions]
      .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))
      .find((version) => version.effectiveFrom <= effectiveDate);
    if (!selected) throw new RangeError(`Für den ${effectiveDate} ist kein ${document.type}-Rechtsstand vorhanden.`);
    return selected;
  }

  function findFeeByValue(entries, valueCent) {
    if (!Number.isInteger(valueCent) || valueCent < 0) throw new TypeError("Der Gegenstandswert muss als nicht negativer Centbetrag vorliegen.");
    let low = 0;
    let high = entries.length - 1;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (entries[middle].valueLimitCent >= valueCent) high = middle;
      else low = middle + 1;
    }
    const entry = entries[low];
    if (entry.valueLimitCent < valueCent) {
      return { feeCent: entry.feeCent, valueLimitCent: entry.valueLimitCent, exceededMaximum: true };
    }
    return { feeCent: entry.feeCent, valueLimitCent: entry.valueLimitCent, exceededMaximum: false };
  }

  global.GebuehrentabellenService = Object.freeze({ load, selectVersion, findFeeByValue, validateDocument });
})(window);
