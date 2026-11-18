/* Demo FHIR R4 mapping and workflow gates. No clinical data or network transport. */
(function(root){
'use strict';
const code=(r,c,system)=>r.code?.coding?.some(x=>x.code===c&&x.system===system);
function validDate(value){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value))return false;
 const [year,month,day]=value.slice(0,10).split('-').map(Number);
 const days=new Date(Date.UTC(year,month,0)).getUTCDate();
 return month>=1&&month<=12&&day>=1&&day<=days&&Number.isFinite(Date.parse(value));
}
const synthetic=r=>(r.meta?.tag||[]).some(t=>t.system==='urn:loop:demo'&&t.code==='synthetic');
function ingest(bundle){
 if(bundle?.resourceType!=='Bundle'||bundle.type!=='collection'||!Array.isArray(bundle.entry)||bundle.entry.length>2000)throw Error('Expected a demo FHIR collection Bundle, at most 2,000 entries.');
 if(!validDate(bundle.timestamp))throw Error('A valid dated Bundle timestamp is required for the demo snapshot.');
 const asOf=bundle.timestamp;
 const rs=bundle.entry.map(e=>e?.resource);
 if(rs.some(r=>!r||!r.id||!synthetic(r)))throw Error('Every resource must be explicitly tagged synthetic. Real patient records are not accepted.');
 const keys=new Set(); for(const r of rs){let k=r.resourceType+'/'+r.id;if(keys.has(k))throw Error('Duplicate resource identity: '+k);keys.add(k);}
 const ps=rs.filter(r=>r.resourceType==='Patient');
 if(!ps.length)throw Error('No synthetic Patient resources found.');
 const warnings=[];
 const patientRefs=new Set(ps.map(p=>'Patient/'+p.id));
 for(const r of rs){
  if(!/^[A-Za-z0-9.-]{1,64}$/.test(r.id))throw Error('Invalid FHIR resource id.');
  for(const key of ['effectiveDateTime','performedDateTime','authoredOn','issued','start','end'])if(r[key]&&!validDate(r[key]))throw Error('Invalid date in '+r.resourceType+'/'+r.id);
  if(r.resourceType==='Appointment')for(const participant of r.participant||[]){const ref=participant.actor?.reference;if(ref?.startsWith('Patient/')&&!patientRefs.has(ref))throw Error('Unresolved appointment patient: '+ref);}
 }
 const mapped=ps.map(p=>{
  const ref='Patient/'+p.id, own=rs.filter(r=>r.subject?.reference===ref||r.for?.reference===ref);
  const positives=own.filter(r=>r.resourceType==='Observation'&&r.status==='final'&&code(r,'12503-9','http://loinc.org')&&r.valueCodeableConcept?.coding?.some(c=>c.code==='POS'&&c.system==='http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation'));
  const quality=[];if(positives.length!==1)quality.push(positives.length?'Multiple positive FIT episodes require matching':'Final positive FIT evidence missing');
  const positive=own.find(r=>r.resourceType==='Observation'&&r.status==='final'&&code(r,'12503-9','http://loinc.org')&&r.valueCodeableConcept?.coding?.some(c=>c.code==='POS'&&c.system==='http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation'));
  const referral=own.find(r=>r.resourceType==='ServiceRequest'&&r.status==='active'&&r.intent==='order');
  const procedures=own.filter(r=>r.resourceType==='Procedure'&&r.status==='completed'&&code(r,'73761001','http://snomed.info/sct'));
  if(procedures.length>1)quality.push('Multiple completed procedures require episode matching');
  const procedure=procedures[0];
  const appt=rs.find(r=>r.resourceType==='Appointment'&&r.status==='booked'&&r.participant?.some(x=>x.actor?.reference===ref));
  const reportRefs=new Set((procedure?.report||[]).map(x=>x.reference));
  const report=own.find(r=>r.resourceType==='DiagnosticReport'&&r.status==='final'&&reportRefs.has('DiagnosticReport/'+r.id));
  if(positive&&!positive.effectiveDateTime)quality.push('Positive FIT date missing');
  if(procedure&&!procedure.performedDateTime)quality.push('Procedure date missing');
  if(procedure?.performedDateTime&&positive?.effectiveDateTime&&Date.parse(procedure.performedDateTime)<Date.parse(positive.effectiveDateTime))quality.push('Procedure predates positive FIT');
  if(report?.issued&&procedure?.performedDateTime&&Date.parse(report.issued)<Date.parse(procedure.performedDateTime))quality.push('Report predates procedure');
  if(positive?.effectiveDateTime&&Date.parse(positive.effectiveDateTime)>Date.parse(asOf))quality.push('Positive FIT is later than the snapshot');
  if(procedure?.performedDateTime&&Date.parse(procedure.performedDateTime)>Date.parse(asOf))quality.push('Completed procedure is later than the snapshot');
  if(report?.issued&&Date.parse(report.issued)>Date.parse(asOf))quality.push('Final report is later than the snapshot');
  quality.forEach(issue=>warnings.push(p.id+': '+issue));
  if(!positive)warnings.push(p.id+': no final positive FIT recognized');
  const unsupported=own.filter(r=>!['Observation','ServiceRequest','Procedure','DiagnosticReport'].includes(r.resourceType));
  if(unsupported.length)warnings.push(p.id+': unsupported resources ignored');
  return {id:p.id,quality,positive:positive?.effectiveDateTime||null,referral:referral?.id||null,appointment:appt?.start||null,procedure:procedure?.id||null,procedureDate:procedure?.performedDateTime||null,report:report?.id||null,stage:quality.length?'Needs reconciliation':procedure?'Evidence review':appt?'Booked':referral?'Awaiting booking':positive?'Referral needed':'Needs reconciliation',resources:own.map(r=>({type:r.resourceType,id:r.id,status:r.status,date:r.effectiveDateTime||r.performedDateTime||r.authoredOn||r.issued||'',version:r.meta?.versionId||'1'}))};
 });
 for(const r of rs){const ref=r.subject?.reference||r.for?.reference;if(ref&&!ps.some(p=>'Patient/'+p.id===ref))throw Error('Unresolved patient reference: '+ref);}
 return {patients:mapped,warnings,resourceCount:rs.length,asOf};
}
function closureIssues(p,review){
 const missing=[];if(p.quality?.length)missing.push('Source reconciliation: '+p.quality.join(', '));if(!p.procedure)missing.push('Completed colonoscopy source');if(!p.report)missing.push('Final report linked to the completed procedure');
 if(!review.plan?.trim())missing.push('Documented follow-up plan');if(!review.ack)missing.push('Patient acknowledgement');if(!review.owner?.trim())missing.push('Accountable owner');if(!review.attest)missing.push('Human evidence review');return missing;
}
const api={ingest,closureIssues,validDate}; if(typeof module!=='undefined')module.exports=api;else root.LoopCare=api;
})(typeof window==='undefined'?{}:window);
