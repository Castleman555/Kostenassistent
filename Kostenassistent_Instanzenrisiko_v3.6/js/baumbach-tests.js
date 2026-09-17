(function (global) {
  "use strict";
  function assert(condition, label) { if (!condition) throw new Error(label); }
  const p = (id, name, role) => ({ id, name, role });
  const c = (id, type, fromId, againstId, amount, success, extra = {}) => ({ id, type, fromId, againstId, amountCent: amount * 100, successCent: success * 100, ...extra });
  function run() {
    const api = global.BaumbachBerechnung;
    const cases = [];
    const check = (label, input, verify) => { const result=api.calculate(input); assert(result.validCheck, `${label}: Gegenprobe`); verify(result); cases.push(label); };

    check("ein Kläger, zwei Beklagte", { parties:[p("K","Kläger","plaintiff"),p("B1","Beklagter 1","defendant"),p("B2","Beklagter 2","defendant")], claims:[c("a","claim","K","B1",8000,2000),c("b","claim","K","B2",8000,0)] }, r => assert(r.parties.find(x=>x.id==="K").courtQuote.numerator===7 && r.parties.find(x=>x.id==="K").courtQuote.denominator===8,"Beispiel 1: Klägerquote"));
    check("zwei Kläger, ein Beklagter", { parties:[p("K1","Kläger 1","plaintiff"),p("K2","Kläger 2","plaintiff"),p("B","Beklagter","defendant")], claims:[c("a","claim","K1","B",5000,3000),c("b","claim","K2","B",3000,3000)] }, r => assert(r.fictitiousValueCent===800000 && r.parties.find(x=>x.id==="B").lossCent===600000,"Mehrere Kläger"));
    check("Klage und Widerklage", { parties:[p("K","Kläger","plaintiff"),p("B","Beklagter","defendant")], claims:[c("a","claim","K","B",10000,7000),c("w","counterclaim","B","K",4000,1000)] }, r => assert(r.parties.find(x=>x.id==="K").lossCent===400000,"Widerklage"));
    check("Widerklage gegen nur einen Kläger", { parties:[p("K1","Kläger 1","plaintiff"),p("K2","Kläger 2","plaintiff"),p("B","Beklagter","defendant")], claims:[c("a","claim","K1","B",3000,2000),c("b","claim","K2","B",3000,1000),c("w","counterclaim","B","K1",2000,500)] }, r => assert(r.parties.find(x=>x.id==="K2").involvementCent===300000,"Selektive Widerklage"));
    check("Drittwiderklage", { parties:[p("K","Kläger","plaintiff"),p("B","Beklagter","defendant"),p("D","Drittwiderbeklagter","thirdParty")], claims:[c("a","claim","K","B",5000,3000),c("d","thirdPartyCounterclaim","B","D",2500,1000)] }, r => assert(r.parties.find(x=>x.id==="D").lossCent===100000,"Drittwiderklage"));
    check("mehrere Kläger und mehrere Beklagte", { parties:[p("K1","Kläger 1","plaintiff"),p("K2","Kläger 2","plaintiff"),p("B1","Beklagter 1","defendant"),p("B2","Beklagter 2","defendant")], claims:[c("a","claim","K1","B1",4000,3000),c("b","claim","K1","B2",4000,1000),c("c","claim","K2","B1",2000,2000),c("d","claim","K2","B2",2000,0)] }, r => assert(r.fictitiousValueCent===1200000&&r.parties.reduce((s,x)=>s+x.lossCent,0)===1200000,"Mehrparteienfall"));
    check("kombinierter Fall", { parties:[p("K1","Kläger 1","plaintiff"),p("K2","Kläger 2","plaintiff"),p("B1","Beklagter 1","defendant"),p("B2","Beklagter 2","defendant"),p("D","Drittwiderbeklagter","thirdParty")], claims:[c("a","claim","K1","B1",5000,2500),c("b","claim","K2","B2",3000,1000),c("w","counterclaim","B1","K1",2000,1500),c("dw","thirdPartyCounterclaim","B2","D",1000,400)] }, r => assert(r.parties.length===5&&r.validCheck,"Kombination"));
    check("vollständiges Obsiegen und Unterliegen", { parties:[p("K","Kläger","plaintiff"),p("B1","Beklagter 1","defendant"),p("B2","Beklagter 2","defendant")], claims:[c("a","claim","K","B1",1000,1000),c("b","claim","K","B2",1000,0)] }, r => { assert(r.parties.find(x=>x.id==="B1").lossCent===100000,"Vollständiges Obsiegen");assert(r.parties.find(x=>x.id==="B2").lossCent===0,"Vollständiges Unterliegen"); });
    check("Gesamtschuld mit Einzelhaftung", { parties:[p("K","Kläger","plaintiff"),p("B1","Beklagter 1","defendant"),p("B2","Beklagter 2","defendant")], claims:[c("a","claim","K","B1",8000,8000,{jointGroupId:"G1",jointShareCent:600000}),c("b","claim","K","B2",8000,6000,{jointGroupId:"G1",jointShareCent:600000})] }, r => { assert(r.jointGroups[0].quote.numerator===3 && r.jointGroups[0].quote.denominator===4,"Gesamtschuldquote"); assert(r.parties.find(x=>x.id==="B1").individualCourtLossCent===200000,"Einzelhaftung"); });
    check("mehrere Gesamtschuldgruppen", { parties:[p("K","Kläger","plaintiff"),p("B1","Beklagter 1","defendant"),p("B2","Beklagter 2","defendant"),p("B3","Beklagter 3","defendant")], claims:[c("a","claim","K","B1",1000,1000,{jointShares:[{groupId:"G1",amountCent:40000},{groupId:"G2",amountCent:20000}]}),c("b","claim","K","B2",1000,800,{jointShares:[{groupId:"G1",amountCent:40000}]}),c("c","claim","K","B3",1000,600,{jointShares:[{groupId:"G2",amountCent:20000}]})] }, r => assert(r.jointGroups.length===2&&r.parties.find(x=>x.id==="B1").individualCourtLossCent===40000,"Mehrfachzuordnung Gesamtschuld"));
    let invalid=false; try { api.calculate({parties:[p("K","K","plaintiff"),p("B","B","defendant")],claims:[c("a","claim","K","B",100,101)]}); } catch (_) { invalid=true; } assert(invalid,"Überhöhter Erfolg muss abgelehnt werden.");
    if (global.BaumbachErfassung) {
      const capture = global.BaumbachErfassung;
      const base = capture.reconcile({ plaintiffCount:2, defendantCount:2, thirdPartyCount:1, counterclaimEnabled:false, thirdPartyEnabled:false });
      assert(base.parties.length===4 && base.claims.length===4, "Zwei Kläger und zwei Beklagte müssen vier Klageverhältnisse erzeugen.");
      base.claims[0].amountCent=500000; base.claims[0].successCent=300000; base.claims[0].source="manual-changed";
      const preserved=capture.reconcile({ plaintiffCount:2, defendantCount:3, thirdPartyCount:1, counterclaimEnabled:false, thirdPartyEnabled:false },base);
      assert(preserved.claims.find(x=>x.key===base.claims[0].key).amountCent===500000,"Manuelle Werte müssen bei Erhöhung der Parteizahl erhalten bleiben.");
      const selectedKey=capture.allPairs(base.parties,"counterclaim")[0].key;
      const withCounter=capture.reconcile({ plaintiffCount:2, defendantCount:2, thirdPartyCount:1, counterclaimEnabled:true, thirdPartyEnabled:false },{...base,selectedPairs:{counterclaim:[selectedKey]}});
      assert(withCounter.claims.filter(x=>x.type==="counterclaim").length===1,"Nur ausgewählte Widerklageverhältnisse dürfen erzeugt werden.");
      const third=capture.reconcile({ plaintiffCount:1, defendantCount:1, thirdPartyCount:1, counterclaimEnabled:false, thirdPartyEnabled:true });
      assert(third.claims.some(x=>x.type==="thirdPartyCounterclaim"),"Das eindeutige Drittwiderklageverhältnis muss automatisch entstehen.");
      const suggestions=capture.suggestFromTexts(third.claims,{claim:{requests:"Zahlung von 8.000,00 €",tenor:"2.000,00 €"},thirdPartyCounterclaim:{}},value=>global.FormUtils?global.FormUtils.parseGermanMoneyToCent(value):Math.round(Number(value.replace(".","").replace(",","."))*100));
      assert(suggestions.find(x=>x.type==="claim").amountCent===800000&&!suggestions.find(x=>x.type==="claim").confirmed,"Textwerte müssen unbestätigte Vorschläge bleiben.");
      assert(capture.availableJointGroups(base.parties,"claim").length===1,"Bei zwei Beklagten muss eine Gesamtschuldgruppe entstehen.");
      assert(capture.combinations([1,2,3]).length===4,"Bei drei Beteiligten müssen vier Teilgruppen entstehen.");
      cases.push("Erfassung 2x2","Werterhalt","selektive Widerklage","eindeutige Drittwiderklage","Textvorschläge","Gesamtschuldgruppen");
    }
    return { passed: cases.length + 1, cases };
  }
  global.BaumbachTests = Object.freeze({ run });
})(window);
