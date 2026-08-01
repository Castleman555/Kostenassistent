(function (global) {
  "use strict";
  const U = global.FormUtils;
  const Calc = global.BaumbachBerechnung;
  const roleLabels = { plaintiff: "Kläger", defendant: "Beklagter", thirdParty: "Drittwiderbeklagter" };
  const typeLabels = { claim: "Klage", counterclaim: "Widerklage", thirdPartyCounterclaim: "Drittwiderklage" };
  const state = { parties: [], claims: [], quoteFormat: "fraction", percentDigits: 0 };
  let nextParty = 1, nextClaim = 1, saveTimer;

  const esc = value => String(value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
  const formatInput = cents => (cents / 100).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const byId = id => state.parties.find(p => p.id === id);
  const partyName = id => byId(id)?.name || "unbekannte Partei";
  const genitive = name => String(name).replace(/^der Kläger$/, "des Klägers").replace(/^die Klägerin$/, "der Klägerin").replace(/^der Beklagte(.*)$/, "des Beklagten$1").replace(/^die Beklagte(.*)$/, "der Beklagten$1").replace(/^der Drittwiderbeklagte(.*)$/, "des Drittwiderbeklagten$1");
  function quote(ratio) { if (!ratio || ratio.numerator === 0) return "0"; if (ratio.numerator === ratio.denominator) return "1"; if (state.quoteFormat === "percent") return (ratio.decimal*100).toLocaleString("de-DE",{minimumFractionDigits:state.percentDigits,maximumFractionDigits:state.percentDigits})+" %"; return `${ratio.numerator}/${ratio.denominator}`; }
  function join(parts) { return parts.length < 2 ? (parts[0] || "") : `${parts.slice(0,-1).join(", ")} und ${parts.at(-1)}`; }

  function defaultName(role) {
    const count=state.parties.filter(p=>p.role===role).length+1;
    if (role==="plaintiff") return count===1 ? "der Kläger" : `der Kläger zu ${count})`;
    if (role==="defendant") return count===1 ? "der Beklagte" : `der Beklagte zu ${count})`;
    return count===1 ? "der Drittwiderbeklagte" : `der Drittwiderbeklagte zu ${count})`;
  }
  function addParty(role, name) { state.parties.push({ id:`P${nextParty++}`, role, name:name||defaultName(role) }); renderParties(); renderClaims(); scheduleSave(); }
  function preferred(type, side) {
    const role = type==="claim" ? (side==="from"?"plaintiff":"defendant") : type==="counterclaim" ? (side==="from"?"defendant":"plaintiff") : (side==="from"?"defendant":"thirdParty");
    const used=state.claims.filter(c=>c.type===type).map(c=>side==="from"?c.fromId:c.againstId);
    return state.parties.find(p=>p.role===role&&!used.includes(p.id))?.id || state.parties.find(p=>p.role===role)?.id || state.parties[side==="from"?0:1]?.id || "";
  }
  function addClaim(type="claim") { state.claims.push({ id:`A${nextClaim++}`, type, fromId:preferred(type,"from"), againstId:preferred(type,"against"), amountCent:0, successCent:0, jointGroupId:"", jointShareCent:0 }); renderClaims(); scheduleSave(); }
  function options(selected) { return state.parties.map(p=>`<option value="${p.id}" ${p.id===selected?"selected":""}>${esc(p.name)} (${roleLabels[p.role]})</option>`).join(""); }

  function renderParties() {
    document.getElementById("partyList").innerHTML=state.parties.map((p,i)=>`<article class="party-entry" data-party="${p.id}"><div class="entry-number">${i+1}</div><label>Bezeichnung<input data-party-name type="text" value="${esc(p.name)}"></label><label>Parteistellung<select data-party-role>${Object.entries(roleLabels).map(([v,l])=>`<option value="${v}" ${p.role===v?"selected":""}>${l}</option>`).join("")}</select></label><button type="button" class="icon-button danger-icon-button" data-remove-party aria-label="${esc(p.name)} entfernen" ${state.parties.length<=2?"disabled":""}>×</button></article>`).join("");
  }
  function renderClaims() {
    document.getElementById("claimList").innerHTML=state.claims.map((c,i)=>`<article class="claim-entry" data-claim="${c.id}"><div class="claim-entry-head"><span class="entry-number">${i+1}</span><label>Art<select data-claim-type>${Object.entries(typeLabels).map(([v,l])=>`<option value="${v}" ${c.type===v?"selected":""}>${l}</option>`).join("")}</select></label><button type="button" class="icon-button danger-icon-button" data-remove-claim aria-label="Anspruch entfernen" ${state.claims.length<=1?"disabled":""}>×</button></div><div class="claim-fields"><label>Anspruchsteller<select data-from>${options(c.fromId)}</select></label><label>Anspruchsgegner<select data-against>${options(c.againstId)}</select></label><label>Forderung<span class="money-field"><input data-amount inputmode="decimal" value="${formatInput(c.amountCent)}"><span>€</span></span></label><label>Erfolg des Anspruchstellers<span class="money-field"><input data-success inputmode="decimal" value="${formatInput(c.successCent)}"><span>€</span></span></label><label>Gesamtschuldgruppe<select data-joint-group><option value="">keine</option><option value="G1" ${c.jointGroupId==="G1"?"selected":""}>Gruppe 1</option><option value="G2" ${c.jointGroupId==="G2"?"selected":""}>Gruppe 2</option><option value="G3" ${c.jointGroupId==="G3"?"selected":""}>Gruppe 3</option></select></label><label class="joint-share ${c.jointGroupId?"":"is-disabled"}">Davon gemeinsamer Erfolg<span class="money-field"><input data-joint-share inputmode="decimal" value="${formatInput(c.jointShareCent)}" ${c.jointGroupId?"":"disabled"}><span>€</span></span></label></div></article>`).join("");
  }
  function sync() {
    document.querySelectorAll("[data-party]").forEach(el=>{const p=byId(el.dataset.party);p.name=el.querySelector("[data-party-name]").value.trim();p.role=el.querySelector("[data-party-role]").value;});
    document.querySelectorAll("[data-claim]").forEach(el=>{const c=state.claims.find(x=>x.id===el.dataset.claim);c.type=el.querySelector("[data-claim-type]").value;c.fromId=el.querySelector("[data-from]").value;c.againstId=el.querySelector("[data-against]").value;c.amountCent=U.parseGermanMoneyToCent(el.querySelector("[data-amount]").value);c.successCent=U.parseGermanMoneyToCent(el.querySelector("[data-success]").value);c.jointGroupId=el.querySelector("[data-joint-group]").value;c.jointShareCent=c.jointGroupId?U.parseGermanMoneyToCent(el.querySelector("[data-joint-share]").value):0;});
    state.quoteFormat=document.getElementById("quoteFormat").value; state.percentDigits=Number(document.getElementById("percentDigits").value);
  }
  function validationErrors() {
    const errors=[]; const names=state.parties.map(p=>p.name.toLocaleLowerCase("de-DE"));
    state.parties.forEach((p,i)=>{if(!p.name)errors.push(`Beteiligter ${i+1}: Bezeichnung fehlt.`);if(names.indexOf(p.name.toLocaleLowerCase("de-DE"))!==i)errors.push(`Die Bezeichnung „${p.name}“ ist mehrfach vergeben.`);});
    if(!state.parties.some(p=>p.role==="plaintiff"))errors.push("Mindestens ein Kläger ist erforderlich.");
    if(!state.parties.some(p=>p.role==="defendant"))errors.push("Mindestens ein Beklagter ist erforderlich.");
    state.claims.forEach((c,i)=>{const n=i+1;if(c.fromId===c.againstId)errors.push(`Anspruch ${n}: Anspruchsteller und Anspruchsgegner müssen verschieden sein.`);if(!Number.isInteger(c.amountCent)||c.amountCent<=0)errors.push(`Anspruch ${n}: Die Forderung muss größer als 0 sein.`);if(!Number.isInteger(c.successCent)||c.successCent<0||c.successCent>c.amountCent)errors.push(`Anspruch ${n}: Der Erfolg muss zwischen 0 und der Forderung liegen.`);if(c.type==="claim"&&(byId(c.fromId)?.role!=="plaintiff"||byId(c.againstId)?.role!=="defendant"))errors.push(`Anspruch ${n}: Eine Klage verläuft vom Kläger zum Beklagten.`);if(c.type==="counterclaim"&&(byId(c.fromId)?.role!=="defendant"||byId(c.againstId)?.role!=="plaintiff"))errors.push(`Anspruch ${n}: Eine Widerklage verläuft vom Beklagten zum Kläger.`);if(c.type==="thirdPartyCounterclaim"&&(byId(c.fromId)?.role!=="defendant"||byId(c.againstId)?.role!=="thirdParty"))errors.push(`Anspruch ${n}: Eine Drittwiderklage verläuft vom Beklagten zum Drittwiderbeklagten.`);if(c.jointGroupId&&(!Number.isInteger(c.jointShareCent)||c.jointShareCent<=0||c.jointShareCent>c.successCent))errors.push(`Anspruch ${n}: Der gemeinsame Erfolg muss größer als 0 und darf nicht höher als der Erfolg sein.`);});
    [...new Set(state.claims.filter(c=>c.jointGroupId).map(c=>c.jointGroupId))].forEach(id=>{const rows=state.claims.filter(c=>c.jointGroupId===id);if(new Set(rows.map(c=>c.againstId)).size<2)errors.push(`${id}: Es müssen mindestens zwei verschiedene Gesamtschuldner beteiligt sein.`);if(new Set(rows.map(c=>c.fromId)).size!==1)errors.push(`${id}: Die verbundenen Ansprüche müssen denselben Anspruchsteller haben.`);if(new Set(rows.map(c=>c.jointShareCent)).size>1)errors.push(`${id}: Der gemeinsame Erfolgsbetrag muss in allen zugehörigen Ansprüchen identisch sein.`);});
    return [...new Set(errors)];
  }
  function showErrors(id,errors){const box=document.getElementById(id);box.hidden=!errors.length;box.innerHTML=errors.length?`<strong>Bitte prüfen:</strong><ul>${errors.map(e=>`<li>${esc(e)}</li>`).join("")}</ul>`:"";}
  function calculateSafe(){const errors=validationErrors();if(errors.length)return{errors};try{return{result:Calc.calculate(state)}}catch(error){return{errors:[error.message]}}}

  function attorneyParts(party, result) {
    const remaining=new Map(party.attorneyReimbursements.map(entry=>[entry.payerId,entry.amountCent]));
    const parts=[];
    result.jointGroups.forEach(group=>{
      const related=result.claims.filter(claim=>claim.jointGroupId===group.id&&claim.fromId===party.id);
      const payers=[...new Set(related.map(claim=>claim.againstId))];
      if(payers.length<2)return;
      const amount=related.reduce((sum,claim)=>sum+claim.jointShareCent,0);
      related.forEach(claim=>remaining.set(claim.againstId,(remaining.get(claim.againstId)||0)-claim.jointShareCent));
      parts.push({label:`${join(payers.map(partyName))} als Gesamtschuldner`,amountCent:amount,quote:Calc.ratio(amount,party.involvementCent)});
    });
    remaining.forEach((amountCent,payerId)=>{if(amountCent>0)parts.push({label:partyName(payerId),amountCent,quote:Calc.ratio(amountCent,party.involvementCent)});});
    return parts;
  }

  function renderReview() {
    const checked=calculateSafe(); showErrors("reviewErrors",checked.errors||[]); document.getElementById("approve").disabled=Boolean(checked.errors?.length); if(!checked.result)return;
    const r=checked.result; document.getElementById("checkBadge").textContent=`Gegenprobe: ${r.validCheck?"100 % ✓":"fehlerhaft"}`;
    document.getElementById("reviewEditor").innerHTML=`<div class="table-wrap"><table class="data-table review-table responsive-review"><thead><tr><th>Prozessverhältnis</th><th>Forderung</th><th>Erfolg</th><th>Unterliegen Anspruchsteller</th></tr></thead><tbody>${state.claims.map(c=>`<tr data-review="${c.id}"><th><span>${typeLabels[c.type]}</span><small>${esc(partyName(c.fromId))} → ${esc(partyName(c.againstId))}</small></th><td data-label="Forderung"><input data-review-amount inputmode="decimal" value="${formatInput(c.amountCent)}"> €</td><td data-label="Erfolg"><input data-review-success inputmode="decimal" value="${formatInput(c.successCent)}"> €</td><td data-label="Unterliegen">${U.formatCent(c.amountCent-c.successCent)}</td></tr>`).join("")}</tbody><tfoot><tr><th>Fiktiver Streitwert</th><td>${U.formatCent(r.fictitiousValueCent)}</td><td colspan="2"></td></tr></tfoot></table></div>`;
    const partyCards=r.parties.map(p=>`<article><h4>${esc(p.name)}</h4><p><span>Beteiligungswert</span><strong>${U.formatCent(p.involvementCent)}</strong></p><p><span>Unterliegen</span><strong>${U.formatCent(p.lossCent)}</strong></p><p><span>Gerichtskostenquote</span><strong>${quote(p.courtQuote)}</strong></p></article>`).join("");
    const reimbursement=r.parties.map(p=>{const parts=attorneyParts(p,r);return `<article><h4>Außergerichtliche Kosten ${genitive(p.name)}</h4>${parts.length?parts.map(e=>`<p>${esc(e.label)}: ${quote(e.quote)} (${U.formatCent(e.amountCent)} / ${U.formatCent(p.involvementCent)})</p>`).join(""):"<p>Keine Erstattung durch eine andere Partei.</p>"}</article>`;}).join("");
    document.getElementById("calculationReview").innerHTML=`<h4>Gerichtskosten</h4><div class="result-party-grid">${partyCards}</div>${r.jointGroups.length?`<div class="joint-result"><strong>Gesamtschuldnerische Anteile:</strong> ${r.jointGroups.map(g=>`${esc(g.payerIds.map(partyName).join(" und "))}: ${quote(g.quote)}`).join("; ")}</div>`:""}<h4 class="result-subheading">Außergerichtliche Kosten</h4><div class="calculation-cards">${reimbursement}</div>`;
  }

  function courtParts(r) {
    const grouped=new Set(r.jointGroups.flatMap(g=>g.payerIds)); const parts=[];
    r.jointGroups.forEach(g=>parts.push(`${join(g.payerIds.map(partyName))} als Gesamtschuldner ${quote(g.quote)}`));
    r.parties.forEach(p=>{const amount=grouped.has(p.id)?p.individualCourtLossCent:p.lossCent;if(amount>0)parts.push(`${p.name} ${quote(Calc.ratio(amount,r.fictitiousValueCent))}`);}); return parts;
  }
  function tenor(r) {
    const lines=[`Von den Gerichtskosten tragen ${join(courtParts(r))}.`];
    r.parties.forEach(p=>{const parts=attorneyParts(p,r);if(!parts.length)return;lines.push(`Von den außergerichtlichen Kosten ${genitive(p.name)} tragen ${join(parts.map(e=>`${e.label} ${quote(e.quote)}`))}.`);});
    lines.push("Im Übrigen behalten die Parteien ihre außergerichtlichen Kosten auf sich."); return lines.join("\n");
  }
  function reasons(r) {
    const claimLines=r.claims.map(c=>`– ${typeLabels[c.type]} ${partyName(c.fromId)} gegen ${partyName(c.againstId)}: ${U.formatCent(c.amountCent)}, davon erfolgreich ${U.formatCent(c.successCent)}`).join("\n");
    const court=r.parties.map(p=>`– ${p.name}: ${U.formatCent(p.lossCent)} / ${U.formatCent(r.fictitiousValueCent)} = ${quote(p.courtQuote)}`).join("\n");
    const outside=r.parties.map(p=>{const items=attorneyParts(p,r).map(e=>`${e.label} mit ${U.formatCent(e.amountCent)} / ${U.formatCent(p.involvementCent)} = ${quote(e.quote)}`).join(", ");return `– Kosten ${genitive(p.name)}: ${items||"keine Erstattung"}`;}).join("\n");
    return `Die Kostenentscheidung beruht auf §§ 91, 92 und 100 ZPO. Wegen der unterschiedlichen Beteiligung und des unterschiedlichen Obsiegens der Streitgenossen sind die Gerichtskosten und die außergerichtlichen Kosten getrennt zu verteilen (Baumbachsche Formel).\n\nErfasste Prozessverhältnisse:\n${claimLines}\n\nDer fiktive Streitwert beträgt danach ${U.formatCent(r.fictitiousValueCent)}. Für die Gerichtskosten sind die Unterliegensbeträge aller Beteiligten zu diesem Wert ins Verhältnis zu setzen:\n${court}\nDie Gegenprobe ergibt ${U.formatCent(r.checkCent)} und damit 100 %.${r.jointGroups.length?`\n\nDie in den Gruppen verbundenen Anteile werden im Tenor gesamtschuldnerisch zusammengefasst; darüber hinausgehende Anteile bleiben Einzelhaftung.`:""}\n\nFür die außergerichtlichen Kosten ist demgegenüber auf die Prozessverhältnisse der jeweils betroffenen Partei abzustellen:\n${outside}`;
  }
  function showStep(n){document.querySelectorAll(".wizard-step").forEach((el,i)=>el.hidden=i+1!==n);document.querySelectorAll("[data-step-indicator]").forEach(el=>{const x=Number(el.dataset.stepIndicator);el.classList.toggle("active",x===n);el.classList.toggle("done",x<n);});scrollTo({top:0,behavior:"smooth"});}
  function scheduleSave(){clearTimeout(saveTimer);saveTimer=setTimeout(()=>{try{global.KostenassistentStorage?.updateCaseModule(null,"baumbachscheFormel",{version:2,...state});}catch(_){}},400);}
  function load(){try{const active=global.KostenassistentStorage?.ensureActiveCase();const saved=active?.module?.baumbachscheFormel;if(saved?.version===2&&Array.isArray(saved.parties)&&Array.isArray(saved.claims)){Object.assign(state,saved);nextParty=Math.max(0,...state.parties.map(p=>Number(p.id.slice(1))||0))+1;nextClaim=Math.max(0,...state.claims.map(c=>Number(c.id.slice(1))||0))+1;return true;}}catch(_){}return false;}
  async function copy(id,button){const area=document.getElementById(id);try{await navigator.clipboard.writeText(area.value);}catch(_){area.select();document.execCommand("copy");}const old=button.textContent;button.textContent="Kopiert ✓";setTimeout(()=>button.textContent=old,1600);}

  document.querySelectorAll("[data-add-party]").forEach(b=>b.onclick=()=>addParty(b.dataset.addParty)); document.getElementById("addClaim").onclick=()=>addClaim();
  document.getElementById("partyList").addEventListener("input",()=>{sync();renderClaims();scheduleSave();}); document.getElementById("partyList").addEventListener("click",e=>{const card=e.target.closest("[data-party]");if(!e.target.closest("[data-remove-party]")||!card)return;const id=card.dataset.party;if(state.claims.some(c=>c.fromId===id||c.againstId===id)){alert("Die Partei ist noch einem Anspruch zugeordnet. Entfernen Sie zuerst diesen Anspruch.");return;}state.parties=state.parties.filter(p=>p.id!==id);renderParties();renderClaims();scheduleSave();});
  document.getElementById("claimList").addEventListener("change",e=>{const card=e.target.closest("[data-claim]");if(!card)return;sync();const c=state.claims.find(x=>x.id===card.dataset.claim);if(e.target.matches("[data-claim-type]")){c.fromId=preferred(c.type,"from");c.againstId=preferred(c.type,"against");}renderClaims();scheduleSave();});
  document.getElementById("claimList").addEventListener("input",()=>{sync();scheduleSave();}); document.getElementById("claimList").addEventListener("focusout",e=>{if(!e.target.matches("[data-amount],[data-success],[data-joint-share]"))return;sync();if(Number.isInteger(U.parseGermanMoneyToCent(e.target.value)))e.target.value=formatInput(U.parseGermanMoneyToCent(e.target.value));scheduleSave();}); document.getElementById("claimList").addEventListener("click",e=>{const card=e.target.closest("[data-claim]");if(!e.target.closest("[data-remove-claim]")||!card)return;state.claims=state.claims.filter(c=>c.id!==card.dataset.claim);renderClaims();scheduleSave();});
  document.getElementById("quoteFormat").onchange=e=>{state.quoteFormat=e.target.value;document.getElementById("percentDigits").disabled=e.target.value!=="percent";scheduleSave();};document.getElementById("percentDigits").onchange=e=>{state.percentDigits=Number(e.target.value);scheduleSave();};
  document.getElementById("baumbachForm").onsubmit=e=>{e.preventDefault();sync();const checked=calculateSafe();showErrors("errorSummary",checked.errors||[]);if(checked.result){renderReview();showStep(2);}};
  document.getElementById("reviewEditor").addEventListener("change",e=>{const row=e.target.closest("[data-review]");if(!row)return;const c=state.claims.find(x=>x.id===row.dataset.review);if(e.target.matches("[data-review-amount]"))c.amountCent=U.parseGermanMoneyToCent(e.target.value);if(e.target.matches("[data-review-success]"))c.successCent=U.parseGermanMoneyToCent(e.target.value);renderReview();scheduleSave();});
  document.getElementById("backToInput").onclick=()=>{renderParties();renderClaims();showStep(1);};document.getElementById("approve").onclick=()=>{const checked=calculateSafe();if(!checked.result){renderReview();return;}document.getElementById("tenorOutput").value=tenor(checked.result);document.getElementById("reasonsOutput").value=reasons(checked.result);showStep(3);};document.getElementById("backToReview").onclick=()=>showStep(2);document.getElementById("restart").onclick=()=>{if(confirm("Neue Berechnung beginnen?")){global.KostenassistentStorage?.clearCaseModule(null,"baumbachscheFormel");location.reload();}};document.querySelectorAll("[data-copy]").forEach(b=>b.onclick=()=>copy(b.dataset.copy,b));document.getElementById("openHelp").onclick=()=>document.getElementById("helpDialog").showModal();

  if(!load()){addParty("plaintiff","der Kläger");addParty("defendant","der Beklagte zu 1)");addParty("defendant","der Beklagte zu 2)");addClaim("claim");addClaim("claim");}else{renderParties();renderClaims();document.getElementById("quoteFormat").value=state.quoteFormat;document.getElementById("percentDigits").value=String(state.percentDigits);document.getElementById("percentDigits").disabled=state.quoteFormat!=="percent";}
  global.BaumbachUI=Object.freeze({state,renderReview});
  if(new URLSearchParams(location.search).has("tests")) console.info("Baumbach-Tests",global.BaumbachTests.run());
})(window);
