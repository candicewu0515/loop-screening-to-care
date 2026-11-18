/* Demo FHIR R4 mapping and workflow gates. No clinical data or network transport. */
(function(root){
'use strict';
const code=(r,c,system)=>r.code?.coding?.some(x=>x.code===c&&x.system===system);
const synthetic=r=>(r.meta?.tag||[]).some(t=>t.system==='urn:loop:demo'&&t.code==='synthetic');
function ingest(bundle){
 if(bundle?.resourceType!=='Bundle'||bundle.type!=='collection'||!Array.isArray(bundle.entry)||bundle.entry.length>2000)throw Error('Expected a demo FHIR collection Bundle, at most 2,000 entries.');
 const rs=bundle.entry.map(e=>e.resource);
 if(rs.some(r=>!r||!r.id||!synthetic(r)))throw Error('Every resource must be explicitly tagged synthetic. Real patient records are not accepted.');
 const keys=new Set(); for(const r of rs){let k=r.resourceType+'/'+r.id;if(keys.has(k))throw Error('Duplicate resource identity: '+k);keys.add(k);}
 const ps=rs.filter(r=>r.resourceType==='Patient');
 if(!ps.length)throw Error('No synthetic Patient resources found.');
 const warnings=[];
 const mapped=ps.map(p=>{
  const ref='Patient/'+p.id, own=rs.filter(r=>r.subject?.reference===ref||r.for?.reference===ref);
  const positive=own.find(r=>r.resourceType==='Observation'&&r.status==='final'&&code(r,'12503-9','http://loinc.org')&&r.valueCodeableConcept?.coding?.some(c=>c.code==='POS'&&c.system==='http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation'));
  const referral=own.find(r=>r.resourceType==='ServiceRequest'&&r.status==='active'&&r.intent==='order');
  const procedure=own.find(r=>r.resourceType==='Procedure'&&r.status==='completed'&&code(r,'73761001','http://snomed.info/sct'));
  const appt=rs.find(r=>r.resourceType==='Appointment'&&r.status==='booked'&&r.participant?.some(x=>x.actor?.reference===ref));
  const report=own.find(r=>r.resourceType==='DiagnosticReport'&&r.status==='final');
  if(!positive)warnings.push(p.id+': no final positive FIT recognized');
  const unsupported=own.filter(r=>!['Observation','ServiceRequest','Procedure','DiagnosticReport'].includes(r.resourceType));
  if(unsupported.length)warnings.push(p.id+': unsupported resources ignored');
  return {id:p.id,positive:positive?.effectiveDateTime||null,referral:referral?.id||null,appointment:appt?.start||null,procedure:procedure?.id||null,procedureDate:procedure?.performedDateTime||null,report:report?.id||null,stage:procedure?'Evidence review':appt?'Booked':referral?'Awaiting booking':positive?'Referral needed':'Needs reconciliation',resources:own.map(r=>({type:r.resourceType,id:r.id,status:r.status,date:r.effectiveDateTime||r.performedDateTime||r.authoredOn||r.issued||'',version:r.meta?.versionId||'1'}))};
 });
 for(const r of rs){const ref=r.subject?.reference||r.for?.reference;if(ref&&!ps.some(p=>'Patient/'+p.id===ref))throw Error('Unresolved patient reference: '+ref);}
 return {patients:mapped,warnings,resourceCount:rs.length};
}
function closureIssues(p,review){
 const missing=[];if(!p.procedure)missing.push('Completed colonoscopy source');if(!p.report&&!review.pathologyNA)missing.push('Final report or reviewed pathology N/A');
 if(!review.plan?.trim())missing.push('Documented follow-up plan');if(!review.ack)missing.push('Patient acknowledgement');if(!review.owner?.trim())missing.push('Accountable owner');if(!review.attest)missing.push('Human evidence review');return missing;
}
const api={ingest,closureIssues}; if(typeof module!=='undefined')module.exports=api;else root.LoopCare=api;
})(typeof window==='undefined'?{}:window);
