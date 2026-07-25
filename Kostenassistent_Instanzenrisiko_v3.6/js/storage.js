(function (global) {
  "use strict";

  // localStorage liegt nur im jeweiligen Browserprofil, ist nicht verschlüsselt
  // und ersetzt keine zentrale oder revisionssichere Fallverwaltung.
  const INDEX_KEY = "kostenassistent.faelle.index.v1";
  const ACTIVE_CASE_KEY = "kostenassistent.fall.aktiv.v1";
  const CASE_KEY_PREFIX = "kostenassistent.fall.";
  const CASE_KEY_SUFFIX = ".v1";
  const CURRENT_VERSION = 1;
  const DEFAULT_CASE_ID = "standardfall";
  const DEFAULT_CASE_NAME = "Unbenannter Fall";

  function storageAvailable() {
    try {
      const testKey = "__kostenassistent_storage_test__";
      global.localStorage.setItem(testKey, testKey);
      global.localStorage.removeItem(testKey);
      return true;
    } catch (error) {
      console.warn("Kostenassistent: localStorage ist nicht verfügbar.", error);
      return false;
    }
  }

  function parseStoredData(value) {
    if (typeof value !== "string" || value === "") return null;
    try {
      return JSON.parse(value);
    } catch (error) {
      console.warn("Kostenassistent: Gespeicherte Daten konnten nicht gelesen werden.", error);
      return null;
    }
  }

  function saveData(key, data) {
    if (!storageAvailable()) return false;
    try {
      global.localStorage.setItem(key, JSON.stringify(data));
      return true;
    } catch (error) {
      console.warn(`Kostenassistent: Daten unter „${key}“ konnten nicht gespeichert werden.`, error);
      return false;
    }
  }

  function loadData(key) {
    if (!storageAvailable()) return null;
    try {
      return parseStoredData(global.localStorage.getItem(key));
    } catch (error) {
      console.warn(`Kostenassistent: Daten unter „${key}“ konnten nicht geladen werden.`, error);
      return null;
    }
  }

  function removeData(key) {
    if (!storageAvailable()) return false;
    try {
      global.localStorage.removeItem(key);
      return true;
    } catch (error) {
      console.warn(`Kostenassistent: Daten unter „${key}“ konnten nicht gelöscht werden.`, error);
      return false;
    }
  }

  function hasData(key) {
    if (!storageAvailable()) return false;
    try {
      return global.localStorage.getItem(key) !== null;
    } catch (error) {
      console.warn(`Kostenassistent: Speicherstatus für „${key}“ konnte nicht geprüft werden.`, error);
      return false;
    }
  }

  function normalizeCaseId(fallId) {
    const normalized = String(fallId || "").trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-");
    return normalized || DEFAULT_CASE_ID;
  }

  function getCaseKey(fallId) {
    return `${CASE_KEY_PREFIX}${normalizeCaseId(fallId)}${CASE_KEY_SUFFIX}`;
  }

  function getActiveCaseId() {
    const stored = loadData(ACTIVE_CASE_KEY);
    return typeof stored === "string" && stored ? stored : null;
  }

  function setActiveCaseId(fallId) {
    return saveData(ACTIVE_CASE_KEY, normalizeCaseId(fallId));
  }

  function createEmptyCase(fallId = DEFAULT_CASE_ID, fallname = DEFAULT_CASE_NAME) {
    const now = new Date().toISOString();
    return {
      version: CURRENT_VERSION,
      fallId: normalizeCaseId(fallId),
      fallname: String(fallname || DEFAULT_CASE_NAME),
      createdAt: now,
      updatedAt: now,
      module: {
        instanzenrisiko: null,
        vergleichskosten: null,
        mehrkostenUndQuotenmethode: null,
        baumbachscheFormel: null
      }
    };
  }

  function isValidCase(caseData) {
    return Boolean(
      caseData &&
      caseData.version === CURRENT_VERSION &&
      typeof caseData.fallId === "string" &&
      caseData.module &&
      typeof caseData.module === "object"
    );
  }

  function loadCase(fallId) {
    const stored = loadData(getCaseKey(fallId));
    if (!stored) return null;
    if (!isValidCase(stored)) {
      console.warn("Kostenassistent: Der gespeicherte Fall hat ein ungültiges oder nicht unterstütztes Format.");
      return null;
    }
    return stored;
  }

  function updateIndex(caseData) {
    const index = Array.isArray(loadData(INDEX_KEY)) ? loadData(INDEX_KEY) : [];
    const entry = {
      fallId: caseData.fallId,
      fallname: caseData.fallname,
      updatedAt: caseData.updatedAt
    };
    const next = index.filter((item) => item && item.fallId !== caseData.fallId);
    next.push(entry);
    next.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    saveData(INDEX_KEY, next);
  }

  function saveCase(caseData) {
    if (!caseData || typeof caseData !== "object") return false;
    const existing = loadCase(caseData.fallId);
    const normalized = {
      ...createEmptyCase(caseData.fallId, caseData.fallname),
      ...caseData,
      version: CURRENT_VERSION,
      fallId: normalizeCaseId(caseData.fallId),
      createdAt: existing?.createdAt || caseData.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      module: {
        ...createEmptyCase().module,
        ...(existing?.module || {}),
        ...(caseData.module || {})
      }
    };
    const saved = saveData(getCaseKey(normalized.fallId), normalized);
    if (saved) updateIndex(normalized);
    return saved;
  }

  function ensureActiveCase() {
    let fallId = getActiveCaseId();
    if (!fallId) {
      fallId = DEFAULT_CASE_ID;
      setActiveCaseId(fallId);
    }
    let caseData = loadCase(fallId);
    if (!caseData) {
      caseData = createEmptyCase(fallId);
      saveCase(caseData);
    }
    return caseData;
  }

  function updateCaseModule(fallId, moduleName, moduleData) {
    const id = normalizeCaseId(fallId || getActiveCaseId() || DEFAULT_CASE_ID);
    const caseData = loadCase(id) || createEmptyCase(id);
    caseData.module = { ...caseData.module, [moduleName]: moduleData };
    return saveCase(caseData);
  }

  function loadCaseModule(fallId, moduleName) {
    const caseData = loadCase(fallId);
    return caseData?.module?.[moduleName] ?? null;
  }

  function clearCaseModule(fallId, moduleName) {
    const id = normalizeCaseId(fallId || getActiveCaseId() || DEFAULT_CASE_ID);
    const caseData = loadCase(id);
    if (!caseData) return true;
    caseData.module = { ...caseData.module, [moduleName]: null };
    return saveCase(caseData);
  }

  function removeCase(fallId) {
    const id = normalizeCaseId(fallId);
    const removed = removeData(getCaseKey(id));
    const index = Array.isArray(loadData(INDEX_KEY)) ? loadData(INDEX_KEY) : [];
    saveData(INDEX_KEY, index.filter((entry) => entry && entry.fallId !== id));
    if (getActiveCaseId() === id) removeData(ACTIVE_CASE_KEY);
    return removed;
  }

  function listCases() {
    const index = loadData(INDEX_KEY);
    return Array.isArray(index) ? index : [];
  }

  global.KostenassistentStorage = Object.freeze({
    saveData,
    loadData,
    removeData,
    hasData,
    parseStoredData,
    getActiveCaseId,
    setActiveCaseId,
    createEmptyCase,
    ensureActiveCase,
    loadCase,
    saveCase,
    updateCaseModule,
    loadCaseModule,
    clearCaseModule,
    removeCase,
    listCases
  });
})(window);
