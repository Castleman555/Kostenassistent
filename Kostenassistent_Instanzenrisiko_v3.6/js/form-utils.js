(function (global) {
  "use strict";

  const euroFormatter = new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  function formatCent(cent) {
    const safeCent = Number.isFinite(cent) ? Math.round(cent) : 0;
    return euroFormatter.format(safeCent / 100);
  }

  function parseGermanMoneyToCent(value) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return Math.round(value * 100);
    }

    const raw = String(value ?? "")
      .trim()
      .replace(/\s/g, "")
      .replace(/€/g, "");

    if (raw === "") return 0;

    let normalized = raw;
    const hasComma = normalized.includes(",");
    const hasDot = normalized.includes(".");

    if (hasComma) {
      normalized = normalized.replace(/\./g, "").replace(",", ".");
    } else if (hasDot) {
      const parts = normalized.split(".");
      const finalPart = parts[parts.length - 1];
      if (parts.length > 1 && finalPart.length === 3) {
        normalized = parts.join("");
      }
    }

    if (!/^-?\d+(\.\d{0,2})?$/.test(normalized)) {
      return null;
    }

    const numeric = Number(normalized);
    if (!Number.isFinite(numeric)) return null;
    return Math.round(numeric * 100);
  }

  function createStableId() {
    if (global.crypto && typeof global.crypto.randomUUID === "function") {
      return global.crypto.randomUUID();
    }
    return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function clampInteger(value, minimum = 1, maximum = 99) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isInteger(parsed)) return minimum;
    return Math.min(maximum, Math.max(minimum, parsed));
  }

  global.FormUtils = Object.freeze({
    formatCent,
    parseGermanMoneyToCent,
    createStableId,
    clampInteger
  });
})(window);
