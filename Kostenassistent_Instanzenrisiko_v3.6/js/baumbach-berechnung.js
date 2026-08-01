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
      if (claim.jointGroupId) {
        assertCent(claim.jointShareCent, `Gesamtschuldanteil ${index + 1}`);
        if (claim.jointShareCent <= 0 || claim.jointShareCent > claim.successCent) throw new TypeError(`Der Gesamtschuldanteil in Prozessverhältnis ${index + 1} ist unplausibel.`);
      }
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
    claims.filter((claim) => claim.jointGroupId).forEach((claim) => {
      const key = claim.jointGroupId;
      const group = jointGroups.get(key) || { id: key, payerIds: [], beneficiaryIds: [], weightCent: 0, claims: [] };
      if (!group.payerIds.includes(claim.againstId)) group.payerIds.push(claim.againstId);
      if (!group.beneficiaryIds.includes(claim.fromId)) group.beneficiaryIds.push(claim.fromId);
      group.weightCent += claim.jointShareCent;
      group.claims.push(claim.id);
      jointGroups.set(key, group);
    });
    jointGroups.forEach((group) => {
      if (group.payerIds.length < 2) throw new TypeError(`Die Gesamtschuldgruppe „${group.id}“ benötigt mindestens zwei Kostenschuldner.`);
      if (group.beneficiaryIds.length !== 1) throw new TypeError(`Die Gesamtschuldgruppe „${group.id}“ muss denselben Anspruchsteller betreffen.`);
    });

    const groupedByParty = new Map();
    jointGroups.forEach((group) => group.payerIds.forEach((partyId) => {
      const ownClaims = claims.filter((claim) => claim.jointGroupId === group.id && claim.againstId === partyId);
      groupedByParty.set(partyId, (groupedByParty.get(partyId) || 0) + ownClaims.reduce((sum, claim) => sum + claim.jointShareCent, 0));
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

  global.BaumbachBerechnung = Object.freeze({ calculate, ratio, gcd });
})(window);
