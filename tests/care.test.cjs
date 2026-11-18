const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const {ingest,closureIssues,validDate}=require('../care-core.js');const fixture=JSON.parse(fs.readFileSync(path.join(__dirname,'../data/fhir-demo.json')));const clone=()=>structuredClone(fixture);
test('FHIR fixture maps milestones without closing episodes',()=>{const r=ingest(clone());assert.equal(r.patients.length,12);for(const stage of ['Referral needed','Awaiting booking','Booked','Evidence review'])assert.equal(r.patients.filter(p=>p.stage===stage).length,3);assert.equal(r.warnings.length,0);});
test('rejects untagged data atomically',()=>{let b=clone();delete b.entry[0].resource.meta;assert.throws(()=>ingest(b),/synthetic/);});
test('rejects duplicates and unmatched subjects',()=>{let b=clone();b.entry.push(b.entry[0]);assert.throws(()=>ingest(b),/Duplicate/);b=clone();b.entry[1].resource.subject.reference='Patient/unknown';assert.throws(()=>ingest(b),/Unresolved/);});
test('wrong code system and nonfinal observations never establish positive FIT',()=>{let b=clone();b.entry[1].resource.code.coding[0].system='urn:wrong';assert.equal(ingest(b).patients[0].positive,null);b=clone();b.entry[1].resource.status='preliminary';assert.equal(ingest(b).patients[0].positive,null);});
test('incomplete procedure cannot establish completed care',()=>{let b=clone();b.entry.filter(e=>e.resource.resourceType==='Procedure').forEach(e=>e.resource.status='not-done');assert.ok(ingest(b).patients.every(p=>!p.procedure));});
test('closure requires source procedure and all human review evidence',()=>{const p=ingest(clone()).patients.find(p=>p.procedure);const r={owner:'Demo reviewer',plan:'Confirm follow-up with care team',ack:true,attest:true};assert.deepEqual(closureIssues(p,r),[]);for(const k of ['owner','plan','ack','attest'])assert.ok(closureIssues(p,{...r,[k]:''}).length);assert.ok(closureIssues({...p,procedure:null},r).length);assert.ok(closureIssues({...p,report:null},r).length);assert.ok(closureIssues({...p,report:null},{...r,pathologyNA:true}).length);});
test('unsupported bundle types and oversized entry arrays rejected',()=>{assert.throws(()=>ingest({...clone(),type:'transaction'}));assert.throws(()=>ingest({...clone(),entry:Array(2001).fill({})}));});
test('workspace scripts render every view and replay source transitions in a DOM stub',()=>{
 const vm=require('node:vm'),elements=new Map();
 const element=s=>{if(!elements.has(s))elements.set(s,{textContent:'',innerHTML:'',value:'',style:{},classList:{toggle(){}},open:false,showModal(){this.open=true;},close(){this.open=false;}});return elements.get(s);};
 const context=vm.createContext({window:{LOOP_FHIR_DEMO:clone()},LoopCare:{ingest,closureIssues,validDate},document:{querySelector:element,querySelectorAll:()=>[]},structuredClone,Date,setTimeout:()=>0,clearTimeout(){}});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../care.js'),'utf8'),context);
 for(const name of ['overview','queue','feed','assistant','audit']){vm.runInContext(`view='${name}';render()`,context);assert.ok(element('#content').innerHTML.length>100);}
 vm.runInContext('replayEvent();replayEvent();replayEvent()',context);
 assert.equal(vm.runInContext("getCases().find(p=>p.id==='DEMO-001').stage",context),'Awaiting booking');
 assert.equal(vm.runInContext("getCases().find(p=>p.id==='DEMO-002').stage",context),'Booked');
 assert.equal(vm.runInContext("getCases().find(p=>p.id==='DEMO-003').stage",context),'Evidence review');
 vm.runInContext("openCase('DEMO-001')",context);element('#owner').value='Demo navigator';element('#plan').value='Plan';element('#reviewer').value='Reviewer';element('#ack').checked=true;element('#attest').checked=true;
 element('#close-case').onclick();assert.match(element('#closure-status').textContent,/Blocked/);
});
test('ambiguous episodes and contradictory evidence block closure',()=>{let b=clone();const fit=structuredClone(b.entry.find(e=>e.resource.id==='fit-DEMO-004'));fit.resource.id='fit-second';b.entry.push(fit);let p=ingest(b).patients.find(p=>p.id==='DEMO-004');assert.equal(p.stage,'Needs reconciliation');assert.ok(closureIssues(p,{plan:'Follow-up',owner:'Reviewer',ack:true,attest:true}).some(x=>x.includes('reconciliation')));b=clone();b.entry.find(e=>e.resource.id==='scope-DEMO-004').resource.performedDateTime='2025-01-01';p=ingest(b).patients.find(p=>p.id==='DEMO-004');assert.ok(p.quality.some(x=>x.includes('predates')));});
test('invalid event dates and orphan appointments reject whole Bundle',()=>{let b=clone();b.entry[1].resource.effectiveDateTime='not-a-date';assert.throws(()=>ingest(b),/Invalid date/);b=clone();b.entry.find(e=>e.resource.resourceType==='Appointment').resource.participant[0].actor.reference='Patient/absent';assert.throws(()=>ingest(b),/Unresolved appointment/);});
test('task workflow blocks unreviewed completion and premature case closure',()=>{
 const vm=require('node:vm'),elements=new Map();
 const make=()=>({textContent:'',innerHTML:'',value:'',checked:false,style:{},classList:{toggle(){}},open:false,showModal(){this.open=true;},close(){this.open=false;},append(){},prepend(){},insertBefore(){},querySelector(){return make();},querySelectorAll(){return [];}});
 const element=s=>{if(!elements.has(s))elements.set(s,make());return elements.get(s);};
 const context=vm.createContext({window:{LOOP_FHIR_DEMO:clone()},LoopCare:{ingest,closureIssues,validDate},document:{querySelector:element,querySelectorAll:()=>[],createElement:make},structuredClone,Date,setTimeout:()=>0,clearTimeout(){}});
 for(const file of ['care.js','care-ops.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../'+file),'utf8'),context);
 for(const v of ['queue','tasks','reports']){vm.runInContext(`view='${v}';render()`,context);assert.ok(element('#content').innerHTML.length>100);}
 assert.equal(vm.runInContext('tasks.length',context),12);
 vm.runInContext("openCase('DEMO-004')",context);element('#close-case').onclick();assert.match(element('#closure-status').textContent,/open navigation tasks/);
 vm.runInContext("openTask('TASK-4')",context);element('#task-owner').value='Demo owner';element('#task-edit-due').value='2026-11-20';element('#complete-task').onclick();assert.match(element('#task-status').textContent,/Completion note/);assert.equal(vm.runInContext('tasks[3].status',context),'open');
 element('#task-review-note').value='Confirmed source report with demo team';element('#task-reviewed').checked=true;element('#complete-task').onclick();assert.equal(vm.runInContext('tasks[3].status',context),'done');assert.equal(vm.runInContext("reviews['DEMO-004']?.closed||false",context),false);
});
test('unrelated reports cannot satisfy closure and pathology N/A cannot bypass report evidence',()=>{
 let b=clone();delete b.entry.find(e=>e.resource.id==='scope-DEMO-004').resource.report;
 const p=ingest(b).patients.find(p=>p.id==='DEMO-004');assert.equal(p.report,null);
 assert.ok(closureIssues(p,{owner:'Reviewer',plan:'Plan',ack:true,attest:true,pathologyNA:true}).some(x=>x.includes('linked')));
});
test('future completion and report evidence remain quarantined relative to the imported snapshot',()=>{
 for(const [id,key] of [['scope-DEMO-004','performedDateTime'],['report-DEMO-004','issued'],['fit-DEMO-004','effectiveDateTime']]){const b=clone();b.entry.find(e=>e.resource.id===id).resource[key]='2027-01-01T00:00:00Z';const p=ingest(b).patients.find(p=>p.id==='DEMO-004');assert.equal(p.stage,'Needs reconciliation');assert.ok(closureIssues(p,{owner:'Reviewer',plan:'Plan',ack:true,attest:true}).length);}
});
test('invalid calendar dates and undated snapshots are rejected rather than silently normalized',()=>{
 assert.equal(validDate('2026-02-30'),false);assert.equal(validDate('2024-02-29'),true);assert.equal(validDate('2026-02-29'),false);
 let b=clone();b.entry[1].resource.effectiveDateTime='2026-02-30T09:00:00Z';assert.throws(()=>ingest(b),/Invalid date/);b=clone();delete b.timestamp;assert.throws(()=>ingest(b),/timestamp/);
});
function workspaceHarness(){
 const vm=require('node:vm'),elements=new Map();
 const make=()=>({textContent:'',innerHTML:'',value:'',checked:false,style:{},classList:{toggle(){}},open:false,showModal(){this.open=true;},close(){this.open=false;},append(){},prepend(){},insertBefore(){},querySelector(){return make();},querySelectorAll(){return [];}});
 const element=s=>{if(!elements.has(s))elements.set(s,make());return elements.get(s);};
 const context=vm.createContext({window:{LOOP_FHIR_DEMO:clone()},LoopCare:{ingest,closureIssues,validDate},document:{querySelector:element,querySelectorAll:()=>[],createElement:make},structuredClone,Date,setTimeout:()=>0,clearTimeout(){}});
 for(const file of ['care.js','care-ops.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../'+file),'utf8'),context);
 return {run:code=>vm.runInContext(code,context),element};
}
test('owner filtering updates counts and clear filters clears the owner constraint',()=>{const h=workspaceHarness();h.run("owners['DEMO-001']='Navigator A';ownerFilter='Navigator A';view='queue';render()");assert.match(h.element('#content').innerHTML,/1 EPISODES/);assert.equal(h.run("workspaceFilter(getCases().find(p=>p.id==='DEMO-002'))"),false);h.element('#reset-filters').onclick();assert.equal(h.run('ownerFilter'),'all');assert.match(h.element('#content').innerHTML,/12 EPISODES/);});
test('single episode owner changes update its open task handoff',()=>{const h=workspaceHarness();h.run("openCase('DEMO-001')");h.element('#owner').value='Navigator B';h.element('#barrier').value='Transport';h.element('#save-owner').onclick();assert.equal(h.run("tasks.find(t=>t.patient==='DEMO-001').owner"),'Navigator B');});
test('editing approved outreach invalidates the current approval',()=>{const h=workspaceHarness();h.run("openCase('DEMO-001')");h.element('#draft').onclick();h.element('#outreach-reviewer').value='Reviewer';h.element('#outreach-check').checked=true;h.element('#outreach-text').value='Reviewed draft';h.element('#approve-outreach').onclick();assert.equal(h.element('#approve-outreach').disabled,true);h.element('#outreach-text').oninput();assert.equal(h.element('#outreach-check').checked,false);assert.equal(h.element('#approve-outreach').disabled,false);});
test('out-of-order imports cannot overwrite the latest chosen workspace',async()=>{const h=workspaceHarness();let finish;const slow={size:100,text:()=>new Promise(r=>finish=r)};h.element('#import-bundle');const first=h.run('importBundle')({target:{files:[slow]}});const latest=clone();latest.timestamp='2026-11-19T12:00:00Z';await h.run('importBundle')({target:{files:[{size:100,text:async()=>JSON.stringify(latest)}]}});finish(JSON.stringify(clone()));await first;assert.equal(h.run('state.asOf'),'2026-11-19T12:00:00Z');assert.equal(h.run('tasks.length'),12);});
test('FHIR IDs matching object prototype names do not inherit an owner or review',async()=>{const h=workspaceHarness();const b=clone();b.entry[0].resource.id='constructor';for(const e of b.entry){if(e.resource.subject?.reference==='Patient/DEMO-001')e.resource.subject.reference='Patient/constructor';}await h.run('importBundle')({target:{files:[{size:100,text:async()=>JSON.stringify(b)}]}});assert.equal(h.run("getCases().find(p=>p.id==='constructor').owner"),'Unassigned');assert.equal(h.run("getCases().find(p=>p.id==='constructor').stage"),'Referral needed');});
test('replaying an imported bundle with existing demo events is idempotent',async()=>{const h=workspaceHarness();h.run('replayEvent()');const exported=h.run('JSON.stringify(bundle)');await h.run('importBundle')({target:{files:[{size:100,text:async()=>exported}]}});const n=h.run('state.resourceCount');assert.doesNotThrow(()=>h.run('replayEvent()'));assert.equal(h.run('state.resourceCount'),n);});
