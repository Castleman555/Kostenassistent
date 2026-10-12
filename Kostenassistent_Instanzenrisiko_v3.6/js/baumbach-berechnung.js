(function (global) {
  "use strict";

  function assertCent(value, label) {
    if (!Number.isInteger(value) || value < 0) throw new TypeError(`${label} muss ein nicht negativer Centbetrag sein.`);
  }

  function gcd(a, b) {
    a = Math.abs(a); b = Math.abs(b);
    while (b) [a, b] = [b, a % b];
    return a || 1;
  }

  function ratio(numerator, denominator) {
    if (!denominator) return { numerator: 0, denominator: 1, decimal: 0 };
    const divisor = gcd(numerator, denominator);
    return { numerator: numerator / divisor, denominator: denominator / divisor, decimal: numerator / denominator };
  }

  // Verteilt die kleinsten darstellbaren Prozenteinheiten nach den größten
  // Nachkommaresten. Bei gleichen Resten bleibt die Eingabereihenfolge stabil.
  function allocateDisplayedPercentages(parts, digits = 0) {
    const places = Math.min(2, Math.max(0, Number.parseInt(digits, 10) || 0));
    const scale = 10 ** places;
    const targetUnits = 100 * scale;
    const snapshot = parts.map(part => ({ numerator: part.numerator, denominator: part.denominator }));
    snapshot.forEach((part, index) => {
      if (!Number.isInteger(part.numerator) || !Number.isInteger(part.denominator) || part.numerator < 0 || part.denominator <= 0) {
        throw new TypeError(`Quote ${index + 1} ist ungültig.`);
      }
    });
    const exactTotal = snapshot.reduce((sum, part) => sum + part.numerator / part.denominator, 0);
    if (Math.abs(exactTotal - 1) > 1e-10) throw new RangeError("Die exakten Anteile ergeben nicht 100 Prozent.");
    const entries = snapshot.map((part, index) => {
      const scaledNumerator = BigInt(part.numerator) * BigInt(targetUnits);
      const denominator = BigInt(part.denominator);
      return { index, units: Number(scaledNumerator / denominator), remainder: scaledNumerator % denominator, denominator };
    });
    let remaining = targetUnits - entries.reduce((sum, entry) => sum + entry.units, 0);
    const order = [...entries].sort((a, b) => {
      const left = a.remainder * b.denominator;
      const right = b.remainder * a.denominator;
      return left === right ? a.index - b.index : (left > right ? -1 : 1);
    });
    for (let i = 0; i < remaining; i += 1) order[i % order.length].units += 1;
    const values = entries.sort((a, b) => a.index - b.index).map(entry => entry.units / scale);
    const sumUnits = entries.reduce((sum, entry) => sum + entry.units, 0);
    return Object.freeze({ values: Object.freeze(values), digits: places, scale, sum: sumUnits / scale, sumUnits, targetUnits, distributedUnits: remaining });
  }

  function verifyDisplayedPercentages(values, digits = 0) {
    const scale = 10 ** Math.min(2, Math.max(0, Number.parseInt(digits, 10) || 0));
    return values.reduce((sum, value) => sum + Math.round(Number(value) * scale), 0) === 100 * scale;
  }

  function percentagesFromCourtTenor(tenorText) {
    const courtSentence = String(tenorText || "").split(/\r?\n/)[0] || "";
    return [...courtSentence.matchAll(/(\d+(?:[.,]\d+)?)\s*%/g)].map(match => Number(match[1].replace(",", ".")));
  }

  function verifyCourtTenorText(tenorText, digits = 0) {
    const values = percentagesFromCourtTenor(tenorText);
    return values.length > 0 && verifyDisplayedPercentages(values, digits);
  }

  function calculate(input) {
    const parties = Array.isArray(input?.parties) ? input.parties.map((party) => ({ ...party })) : [];
    const claims = Array.isArray(input?.claims) ? input.claims.map((claim) => ({ ...claim })) : [];
    const partyMap = new Map(parties.map((party) => [party.id, party]));
    if (parties.length < 2) throw new TypeError("Es müssen mindestens zwei Parteien vorhanden sein.");
    if (!claims.length) throw new TypeError("Es muss mindestens ein Prozessverhältnis vorhanden sein.");

    claims.forEach((claim, index) => {
      if (!partyMap.has(claim.fromId) || !partyMap.has(claim.againstId)) throw new TypeError(`Prozessverhältnis ${index + 1} enthält eine unbekannte Partei.`);
      if (claim.fromId === claim.againstId) throw new TypeError(`Prozessverhältnis ${index + 1} muss zwischen zwei verschiedenen Parteien bestehen.`);
      assertCent(claim.amountCent, `Forderung ${index + 1}`);
      assertCent(claim.successCent, `Erfolg ${index + 1}`);
      if (claim.amountCent <= 0) throw new TypeError(`Forderung ${index + 1} muss größer als null sein.`);
      if (claim.successCent > claim.amountCent) throw new TypeError(`Der Erfolg in Prozessverhältnis ${index + 1} übersteigt die Forderung.`);
      const shares = Array.isArray(claim.jointShares) ? claim.jointShares : (claim.jointGroupId ? [{ groupId: claim.jointGroupId, amountCent: claim.jointShareCent }] : []);
      shares.forEach(share => { assertCent(share.amountCent, `Gesamtschuldanteil ${index + 1}`); if (!share.groupId || share.amountCent <= 0) throw new TypeError(`Der Gesamtschuldanteil in Prozessverhältnis ${index + 1} ist unplausibel.`); });
      if (shares.reduce((sum, share) => sum + share.amountCent, 0) > claim.successCent) throw new TypeError(`Die Gesamtschuldanteile in Prozessverhältnis ${index + 1} übersteigen das Unterliegen.`);
      claim.jointShares = shares;
    });

    const fictitiousValueCent = claims.reduce((sum, claim) => sum + claim.amountCent, 0);
    const partyResults = new Map(parties.map((party) => [party.id, {
      ...party, involvementCent: 0, lossCent: 0, winCent: 0, reimbursementClaims: []
    }]));

    claims.forEach((claim) => {
      const claimantLoss = claim.amountCent - claim.successCent;
      const from = partyResults.get(claim.fromId);
      const against = partyResults.get(claim.againstId);
      from.involvementCent += claim.amountCent;
      against.involvementCent += claim.amountCent;
      from.lossCent += claimantLoss;
      from.winCent += claim.successCent;
      against.lossCent += claim.successCent;
      against.winCent += claimantLoss;
    });

    claims.forEach((claim) => {
      const from = partyResults.get(claim.fromId);
      const against = partyResults.get(claim.againstId);
      const claimantLoss = claim.amountCent - claim.successCent;
      if (claim.successCent > 0) from.reimbursementClaims.push({ payerId: against.id, amountCent: claim.successCent, claimId: claim.id });
      if (claimantLoss > 0) against.reimbursementClaims.push({ payerId: from.id, amountCent: claimantLoss, claimId: claim.id });
    });

    const jointGroups = new Map();
    claims.forEach((claim) => claim.jointShares.forEach((share) => {
      const key = share.groupId;
      const group = jointGroups.get(key) || { id: key, payerIds: [], beneficiaryIds: [], weightCent: 0, claims: [] };
      if (!group.payerIds.includes(claim.againstId)) group.payerIds.push(claim.againstId);
      if (!group.beneficiaryIds.includes(claim.fromId)) group.beneficiaryIds.push(claim.fromId);
      group.weightCent += share.amountCent;
      group.claims.push(claim.id);
      jointGroups.set(key, group);
    }));
    jointGroups.forEach((group) => {
      if (group.payerIds.length < 2) throw new TypeError(`Die Gesamtschuldgruppe „${group.id}“ benötigt mindestens zwei Kostenschuldner.`);
      if (group.beneficiaryIds.length !== 1) throw new TypeError(`Die Gesamtschuldgruppe „${group.id}“ muss denselben Anspruchsteller betreffen.`);
    });

    const groupedByParty = new Map();
    jointGroups.forEach((group) => group.payerIds.forEach((partyId) => {
      const ownShares = claims.filter((claim) => claim.againstId === partyId).flatMap(claim => claim.jointShares.filter(share => share.groupId === group.id));
      groupedByParty.set(partyId, (groupedByParty.get(partyId) || 0) + ownShares.reduce((sum, share) => sum + share.amountCent, 0));
    }));

    const results = [...partyResults.values()].map((party) => {
      const reimbursements = new Map();
      party.reimbursementClaims.forEach((entry) => reimbursements.set(entry.payerId, (reimbursements.get(entry.payerId) || 0) + entry.amountCent));
      return Object.freeze({
        ...party,
        individualCourtLossCent: party.lossCent - (groupedByParty.get(party.id) || 0),
        courtQuote: ratio(party.lossCent, fictitiousValueCent),
        attorneyReimbursements: Object.freeze([...reimbursements].map(([payerId, amountCent]) => Object.freeze({ payerId, amountCent, quote: ratio(amountCent, party.involvementCent) })))
      });
    });

    const checkCent = results.reduce((sum, party) => sum + party.lossCent, 0);
    return Object.freeze({
      fictitiousValueCent,
      claims: Object.freeze(claims),
      parties: Object.freeze(results),
      jointGroups: Object.freeze([...jointGroups.values()].map((group) => Object.freeze({ ...group, quote: ratio(group.weightCent, fictitiousValueCent) }))),
      checkCent,
      validCheck: checkCent === fictitiousValueCent
    });
  }

  global.BaumbachBerechnung = Object.freeze({ calculate, ratio, gcd, allocateDisplayedPercentages, verifyDisplayedPercentages, percentagesFromCourtTenor, verifyCourtTenorText });
})(window);
