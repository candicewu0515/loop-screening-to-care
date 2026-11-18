const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const {ingest,closureIssues}=require('../care-core.js');const fixture=JSON.parse(fs.readFileSync(path.join(__dirname,'../data/fhir-demo.json')));const clone=()=>structuredClone(fixture);
test('FHIR fixture maps milestones without closing episodes',()=>{const r=ingest(clone());assert.equal(r.patients.length,12);for(const stage of ['Referral needed','Awaiting booking','Booked','Evidence review'])assert.equal(r.patients.filter(p=>p.stage===stage).length,3);assert.equal(r.warnings.length,0);});
test('rejects untagged data atomically',()=>{let b=clone();delete b.entry[0].resource.meta;assert.throws(()=>ingest(b),/synthetic/);});
test('rejects duplicates and unmatched subjects',()=>{let b=clone();b.entry.push(b.entry[0]);assert.throws(()=>ingest(b),/Duplicate/);b=clone();b.entry[1].resource.subject.reference='Patient/unknown';assert.throws(()=>ingest(b),/Unresolved/);});
test('wrong code system and nonfinal observations never establish positive FIT',()=>{let b=clone();b.entry[1].resource.code.coding[0].system='urn:wrong';assert.equal(ingest(b).patients[0].positive,null);b=clone();b.entry[1].resource.status='preliminary';assert.equal(ingest(b).patients[0].positive,null);});
test('incomplete procedure cannot establish completed care',()=>{let b=clone();b.entry.filter(e=>e.resource.resourceType==='Procedure').forEach(e=>e.resource.status='not-done');assert.ok(ingest(b).patients.every(p=>!p.procedure));});
test('closure requires source procedure and all human review evidence',()=>{const p=ingest(clone()).patients.find(p=>p.procedure);const r={owner:'Demo reviewer',plan:'Confirm follow-up with care team',ack:true,attest:true};assert.deepEqual(closureIssues(p,r),[]);for(const k of ['owner','plan','ack','attest'])assert.ok(closureIssues(p,{...r,[k]:''}).length);assert.ok(closureIssues({...p,procedure:null},r).length);assert.ok(closureIssues({...p,report:null},r).length);assert.deepEqual(closureIssues({...p,report:null},{...r,pathologyNA:true}),[]);});
test('unsupported bundle types and oversized entry arrays rejected',()=>{assert.throws(()=>ingest({...clone(),type:'transaction'}));assert.throws(()=>ingest({...clone(),entry:Array(2001).fill({})}));});
test('workspace scripts render every view and replay source transitions in a DOM stub',()=>{
 const vm=require('node:vm'),elements=new Map();
 const element=s=>{if(!elements.has(s))elements.set(s,{textContent:'',innerHTML:'',value:'',style:{},classList:{toggle(){}},open:false,showModal(){this.open=true;},close(){this.open=false;}});return elements.get(s);};
 const context=vm.createContext({window:{LOOP_FHIR_DEMO:clone()},LoopCare:{ingest,closureIssues},document:{querySelector:element,querySelectorAll:()=>[]},structuredClone,Date,setTimeout:()=>0,clearTimeout(){}});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../care.js'),'utf8'),context);
 for(const name of ['overview','queue','feed','assistant','audit']){vm.runInContext(`view='${name}';render()`,context);assert.ok(element('#content').innerHTML.length>100);}
 vm.runInContext('replayEvent();replayEvent();replayEvent()',context);
 assert.equal(vm.runInContext("getCases().find(p=>p.id==='DEMO-001').stage",context),'Awaiting booking');
 assert.equal(vm.runInContext("getCases().find(p=>p.id==='DEMO-002').stage",context),'Booked');
 assert.equal(vm.runInContext("getCases().find(p=>p.id==='DEMO-003').stage",context),'Evidence review');
 vm.runInContext("openCase('DEMO-001')",context);element('#owner').value='Demo navigator';element('#plan').value='Plan';element('#reviewer').value='Reviewer';element('#ack').checked=true;element('#attest').checked=true;
 element('#close-case').onclick();assert.match(element('#closure-status').textContent,/Blocked/);
});
