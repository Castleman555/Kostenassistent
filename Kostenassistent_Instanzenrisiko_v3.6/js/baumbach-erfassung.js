(function (global) {
  "use strict";

  const TYPES = Object.freeze({ claim: ["plaintiff", "defendant"], counterclaim: ["defendant", "plaintiff"], thirdPartyCounterclaim: ["defendant", "thirdParty"] });

  function combinations(items) {
    const result = [];
    for (let size = items.length; size >= 2; size -= 1) {
      const visit = (start, selected) => {
        if (selected.length === size) { result.push([...selected]); return; }
        for (let i = start; i < items.length; i += 1) visit(i + 1, [...selected, items[i]]);
      };
      visit(0, []);
    }
    return result;
  }

  function partyName(role, index, count) {
    if (role === "plaintiff") return count === 1 ? "der Kläger" : `der Kläger zu ${index + 1})`;
    if (role === "defendant") return count === 1 ? "der Beklagte" : `der Beklagte zu ${index + 1})`;
    return count === 1 ? "der Drittwiderbeklagte" : `der Drittwiderbeklagte zu ${index + 1})`;
  }

  function makeParties(config) {
    const definitions = [["plaintiff", config.plaintiffCount], ["defendant", config.defendantCount], ["thirdParty", config.thirdPartyEnabled ? config.thirdPartyCount : 0]];
    return definitions.flatMap(([role, count]) => Array.from({ length: count }, (_, index) => ({ id: `${role}-${index + 1}`, role, name: partyName(role, index, count) })));
  }

  function pairKey(type, fromId, againstId) { return `${type}:${fromId}:${againstId}`; }

  function allPairs(parties, type) {
    const roles = TYPES[type];
    const from = parties.filter(p => p.role === roles[0]);
    const against = parties.filter(p => p.role === roles[1]);
    return from.flatMap(a => against.map(b => ({ type, fromId: a.id, againstId: b.id, key: pairKey(type, a.id, b.id) })));
  }

  function defaultClaim(pair, prior, template) {
    if (prior) return { ...prior, ...pair, id: pair.key };
    const copied = template || null;
    return {
      id: pair.key, ...pair,
      amountCent: copied?.amountCent || 0,
      successCent: copied?.successCent || 0,
      source: copied ? "suggested" : "manual",
      confirmed: !copied
    };
  }

  function reconcile(config, previous = {}) {
    const parties = makeParties(config);
    const previousMap = new Map((previous.claims || []).map(claim => [claim.key || pairKey(claim.type, claim.fromId, claim.againstId), claim]));
    const claimPairs = allPairs(parties, "claim");
    const enabled = ["claim"];
    if (config.counterclaimEnabled) enabled.push("counterclaim");
    if (config.thirdPartyEnabled) enabled.push("thirdPartyCounterclaim");
    const selected = previous.selectedPairs || {};
    const claims = [];
    enabled.forEach(type => {
      let pairs = type === "claim" ? claimPairs : allPairs(parties, type).filter(pair => (selected[type] || []).includes(pair.key));
      if (type !== "claim" && pairs.length === 0) {
        const possible = allPairs(parties, type);
        if (possible.length === 1) pairs = possible;
      }
      const firstPrior = (previous.claims || []).find(c => c.type === type);
      pairs.forEach((pair, index) => {
        let template = index > 0 ? (claims.find(c => c.type === type) || firstPrior) : null;
        if (type === "claim" && index > 0) {
          const sameAgainst = claims.find(c => c.type === type && c.againstId === pair.againstId);
          template = sameAgainst || null;
        }
        claims.push(defaultClaim(pair, previousMap.get(pair.key), template));
      });
    });
    return { parties, claims, selectedPairs: selected };
  }

  function extractMoney(text, parseMoney) {
    const matches = String(text || "").match(/\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|\d+(?:,\d{1,2})?/g) || [];
    return matches.map(parseMoney).filter(Number.isInteger).filter(value => value >= 0);
  }

  function suggestFromTexts(claims, texts, parseMoney) {
    const mapping = { claim: "claim", counterclaim: "counterclaim", thirdPartyCounterclaim: "thirdPartyCounterclaim" };
    return claims.map(claim => {
      if (claim.amountCent || claim.successCent || claim.source === "manual-changed") return claim;
      const key = mapping[claim.type];
      const requestValues = extractMoney(texts[key]?.requests, parseMoney);
      const tenorValues = extractMoney(texts[key]?.tenor, parseMoney);
      if (!requestValues.length && !tenorValues.length) return claim;
      return { ...claim, amountCent: requestValues[0] || tenorValues[0] || 0, successCent: tenorValues[0] || 0, source: "suggested", confirmed: false };
    });
  }

  function availableJointGroups(parties, type) {
    const debtorRole = TYPES[type][1];
    return combinations(parties.filter(p => p.role === debtorRole).map(p => p.id));
  }

  global.BaumbachErfassung = Object.freeze({ TYPES, combinations, makeParties, allPairs, pairKey, reconcile, suggestFromTexts, availableJointGroups });
})(window);
