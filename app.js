/* Loop: all patient data is synthetic. No network calls or message delivery. */
'use strict';
const D = window.LOOP_DATA, M = window.LoopMetrics, L = window.LoopLeakage;
const ASOF = D.meta.as_of, KEY = 'future-health-loop-demo-v1';
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number = n => n.toLocaleString('en-US');
const pct = r => r == null ? '—' : (r * 100).toFixed(1) + '%';
let page = ['cascade','worklist','timing','equity','models','scenarios'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'cascade';
let queueMode = 'navigation', queueSearch = '', queuePage = 0, groupField = 'language', selectedCase = null;
let gapStage = 'all', showGapCases = false;
let modelCapacity = 10;
let simulationState = {condition:'standard',policy:'usual_care',patient:'',day:180};
let session = {changes:{},events:[]}, storageOK = true, toastTimer;
try {
  const saved = JSON.parse(localStorage.getItem(KEY));
  if (saved && typeof saved.changes === 'object' && Array.isArray(saved.events)) session = saved;
} catch (_) { storageOK = false; }
function save() { try { localStorage.setItem(KEY, JSON.stringify(session)); } catch (_) { storageOK=false; toast('Saved for this visit only; browser storage is unavailable.'); } }
function patients() { return D.patients.map(p => ({...p,...(session.changes[p.patient_id] || {})})); }
function filtered() { return patients().filter(p => ['county','language','insurance'].every(k => !$('#'+k+'-filter').value || p[k] === $('#'+k+'-filter').value)); }
function toast(message) { clearTimeout(toastTimer); $('#toast').textContent=message; $('#toast').classList.add('show'); toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),3500); }
function download(name, text, type='application/json') {
  const url=URL.createObjectURL(new Blob([text],{type})); const a=document.createElement('a');
  a.href=url; a.download=name; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function exportCohort() {
  const rows=filtered(); if(!rows.length) return toast('No patients match these filters.');
  const fields=Object.keys(rows[0]); const quote=v=>'"'+String(v??'').replace(/"/g,'""')+'"';
  download('loop-synthetic-cohort-2026-11-06.csv',[fields.map(quote).join(','),...rows.map(p=>fields.map(k=>quote(p[k])).join(','))].join('\r\n'),'text/csv;charset=utf-8');
  toast('Exported the filtered synthetic cohort.');
}
function event(p, type, detail, change={}) {
  session.changes[p.patient_id]={...(session.changes[p.patient_id]||{}),...change};
  session.events.push({event_id:'DEMO-'+String(session.events.length+1).padStart(4,'0'),patient_id:p.patient_id,action:type,detail,
    recorded_at:new Date().toISOString(),effective_snapshot:ASOF,actor:'Demo reviewer',simulated:true,delivery:'No external delivery',change});
  save(); render();
}
const headings={
  cascade:['PATIENT FLOW ANALYSIS','Where does follow-up break down?',"Each patient's pathway is rebuilt from dated records, so you can see where it stopped before deciding what to do."],
  worklist:['ACTION WORKLIST','Who needs follow-up, and who owns it?','Sort by waiting time, assign an owner and record what was done. A person reviews every action.'],
  timing:['TIME TO CARE','How long does follow-up take?','Waiting times for completed colonoscopies, shown separately from patients who are still waiting.'],
  equity:['EQUITY & CONTEXT','Who is reaching follow-up?','Completion by group in the fictional cohort, with real county screening coverage shown separately.'],
  models:['MODEL LAB','Can a day-30 model predict missed follow-up?','A small logistic model compared with a simple stage rule on later patients.'],
  scenarios:['SCENARIO LAB','What happens when slots and staff time are limited?','Compare four navigation policies under the same limits, and see when a missing record is not missing care.']
};
function navigate(next, mode) {
  page=next; if(mode) {queueMode=mode;queueSearch='';} queuePage=0; location.hash=next; render();
}
function kpi(label,value,foot,primary=false,progress=null) {
  return `<article class="kpi ${primary?'primary':''}"><div class="kpi-label">${label}<span class="metric-indicator" aria-hidden="true">${primary?'◉':'↗'}</span></div><div class="kpi-value">${value}</div><div class="kpi-foot">${foot}</div>${progress!=null?`<div class="kpi-line" aria-hidden="true"><i style="width:${Math.max(0,Math.min(100,progress*100))}%"></i></div>`:''}</article>`;
}
function commonKpis(s) {
  return `<div class="kpis">${kpi('Colonoscopy within 180 days',pct(s.rate),`${s.timely} / ${s.mature} eligible positive FIT episodes`,true,s.rate)}${kpi('Needs navigation',number(s.overdue),'Over 90 days · colonoscopy not recorded')}${kpi('Median time to colonoscopy',s.median==null?'—':`${s.median}<span>days</span>`,`${s.completed} completed cases only · any duration`)}${kpi('Documented closed loops',number(s.closed),`Of ${s.positives} positive results · any duration`)}</div>`;
}
function cascade(s) {
  const steps=[['FIT ordered',s.n,s.n,'All screening episodes'],['Valid FIT returned',s.valid,s.n,'Valid results only'],['Positive result',s.positives,s.positives,'Follow-up cohort starts here'],['Referral placed',s.referred,s.positives,'Recorded in this demo pathway'],['Appointment booked',s.booked,s.positives,'Booking is not completion'],['Colonoscopy completed',s.completed,s.positives,'Any duration · 180-day KPI above'],['Documented closure',s.closed,s.positives,'Plan, evidence & human review']];
  const rows=steps.map((x,i)=>`<div class="cascade-row"><span class="step-number">0${i+1}</span><div class="stage-title">${x[0]}<small>${x[3]}</small></div><div class="stage-track" role="img" aria-label="${x[0]}: ${x[1]} of ${x[2]}"><i style="width:${x[2]?100*x[1]/x[2]:0}%"></i></div><span class="stage-value">${number(x[1])}</span></div>${i===1?`<div class="branch-note">↳ ${number(s.negative)} negative results continue routine screening. This is appropriate branching, not loss to follow-up.</div>`:''}`).join('');
  const pos=filtered().filter(M.positive), referral=M.queue(pos,ASOF,'referral').length, closure=M.queue(pos,ASOF,'closure').length;
  return `${commonKpis(s)}${leakagePanel(filtered())}<div class="layout-two"><section class="panel"><div class="panel-head"><div><h2>The screening-to-care cascade</h2><p>Seven recorded milestones · snapshot counts</p></div><span class="label-pill">${number(s.n)} episodes</span></div><div class="panel-body">${rows}<p class="chart-note">Rows 1–2 are scaled to all orders; rows 3–7 to positive FIT results. Milestones after positivity include all observed follow-up durations. ${s.invalid} invalid tests require reassessment.</p></div><div class="mini-stats"><div class="mini-stat"><strong>${pct(M.rate(s.positives,s.valid))}</strong>FIT positivity among valid tests</div><div class="mini-stat"><strong>${s.recent}</strong>positives still within 180 days</div><div class="mini-stat"><strong>${s.late}</strong>colonoscopies after 180 days</div></div></section><div><section class="panel"><div class="panel-head"><div><h2>Open work</h2><p>Rule-based queues, ready for human review</p></div></div>${actionCard(s.escalation,'Past the 180-day window','No colonoscopy recorded. Review and escalate.','escalation')}${actionCard(referral,'Referral is missing','Positive over 14 days ago. Verify next steps.','referral')}${actionCard(closure,'Closure needs evidence','Colonoscopy recorded. Check plan and review.','closure')}${actionCard(s.noOwner,'An owner is needed','Unassigned positive cases remain visible.','unassigned')}</section><div class="callout"><div class="callout-number">01</div><div><h3>Every positive result needs an owner</h3><p>Open a case to see the handoff, acknowledge the result and prepare a reviewed follow-up action.</p><button class="text-button" data-go="worklist">Open the worklist →</button></div></div></div></div>`;
}
function leakagePanel(rows) {
  const a=L.analyze(rows,ASOF),top=[...a.bottlenecks].sort((x,y)=>y.n-x.n)[0];
  const selected=a.audit.filter(p=>p.day_180_outcome==='not_completed_by_day_180'&&(gapStage==='all'||p.day_180_gap_stage===gapStage));
  const labels=Object.fromEntries(L.stages.map(s=>[s.id,s.label]));
  const detailLabels={referral_not_recorded:'No referral recorded',acceptance_not_recorded:'Receiving provider not confirmed',booking_not_recorded:'No booking recorded',scheduled_after_cutoff:'Appointment later than day 180',appointment_due_no_completion_record:'Appointment due; completion unverified',appointment_date_not_recorded:'Appointment date missing'};
  return `<section class="panel leakage-panel"><div class="panel-head"><div><div class="eyebrow">THE ANALYSIS / EACH EPISODE COUNTED ONCE</div><h2>Where the 180-day pathway breaks</h2><p>${a.mature_n} positives with full follow-up${a.mature_n>0&&a.mature_n<20?' (small group)':''} · ${a.timely_n} timely procedures · <strong>${a.missed_n} missed the window</strong></p></div><button class="button secondary" id="export-flow">↓ Patient flow audit</button></div><div class="panel-body">${!a.mature_n?'<div class="empty"><strong>No mature positive episodes in this cohort</strong>Recent positives are still being observed, not classified as missed follow-up.</div>':`<div class="analysis-insight"><strong>${top.n} of ${a.missed_n}</strong><div><h3>${a.missed_n?'Largest gap: '+esc(top.label):'All eligible episodes completed within the window'}</h3><p>${a.missed_n?`${pct(top.share_of_missed)} of missed-window episodes. This locates a workflow gap; it does not prove its cause.`:'No missed-window episodes in this filtered cohort.'}</p></div></div><div class="leakage-stack" role="group" aria-label="Mutually exclusive missed-window stages">${a.bottlenecks.filter(s=>s.n).map((s,i)=>`<button style="flex:${s.n};background:${['#633a58','#92708b','#bc9bae','#c9ac8d'][i]}" data-gap-stage="${s.id}" aria-label="${esc(s.label)}: ${s.n} cases">${s.n}</button>`).join('')}</div><div class="table-scroll"><table class="leak-table"><caption class="sr-only">Conditional transitions within the fixed 180-day observation window</caption><thead><tr><th>Transition</th><th>Entered</th><th>Progressed</th><th>Conversion</th><th>Not progressed</th><th>Share of ${a.missed_n} gaps</th></tr></thead><tbody>${a.transitions.map((t,i)=>`<tr><td><button class="text-button gap-row-button" data-gap-stage="${t.id}">${esc(t.label)} ↗</button></td><td>${t.entered}</td><td>${t.progressed}</td><td>${pct(t.conversion_rate)}</td><td><strong>${t.not_progressed}</strong></td><td>${pct(a.bottlenecks[i].share_of_missed)}</td></tr>`).join('')}</tbody></table></div><p class="chart-note">Historical state at each person's positive FIT + 180 days. Later events do not rewrite this table. Conditional conversion uses people who entered each step by day 180; time available for the next step varies. “Not progressed” is not confirmed permanent dropout.</p><div class="gap-split"><article><strong>${a.day180_details.scheduled_after_cutoff||0}</strong><h3>Appointment beyond the window</h3><p>The recorded calendar date was later than day 180. Review scheduling access; capacity constraints are not established.</p></article><article><strong>${a.day180_details.appointment_due_no_completion_record||0}</strong><h3>Due appointment, no completion record</h3><p>Reconcile cancellations, rescheduling or outside care before treating this as nonattendance.</p></article><article><strong>${a.late_recovered_n}</strong><h3>Eventually completed, but late</h3><p>These patients missed the historical target and have since left the current procedure backlog.</p></article></div><details class="gap-case-details" ${showGapCases?'open':''}><summary>Trace the gaps back to individual patients</summary><div class="queue-toolbar" style="padding:15px 0"><label><span class="sr-only">Historical gap stage</span><select id="gap-stage"><option value="all" ${gapStage==='all'?'selected':''}>All missed-window stages</option>${L.stages.map(s=>`<option value="${s.id}" ${gapStage===s.id?'selected':''}>${esc(s.label)}</option>`).join('')}</select></label><span class="small">${selected.length} cases · click an ID for the current evidence trail</span></div><div class="table-scroll gap-table"><table><thead><tr><th>Patient</th><th>Unfinished step at day 180</th><th>Evidence at day 180</th><th>Days in that step</th><th>Today</th></tr></thead><tbody>${selected.map(p=>`<tr><td><button class="patient-link" data-patient="${p.patient_id}">${p.patient_id} ↗</button></td><td>${esc(labels[p.day_180_gap_stage])}</td><td>${esc(detailLabels[p.day_180_gap_detail]||p.day_180_gap_detail)}</td><td>${p.days_in_open_stage_at_day_180}</td><td>${p.completed_later_after_day_180?'Completed later':'Procedure not recorded'}</td></tr>`).join('')}</tbody></table></div></details>`}<div class="note section-gap">Source limitation: cancellation, refusal, transfer-out and verified outside-provider completion were not collected. The dataset supports a location-of-gap analysis; confirmed interruption and root causes cannot be inferred from blank dates. <a href="analysis/patient_leakage_analysis.pdf" target="_blank">Open the analysis figure ↗</a></div></div></section>`;
}
function exportFlow() {
  const rows=L.analyze(filtered(),ASOF).audit;
  if(!rows.length)return toast('No patients match these filters.');
  const fields=Object.keys(rows[0]),q=v=>'"'+String(v??'').replace(/"/g,'""')+'"';
  download('loop-patient-flow-audit.csv',[fields.map(q).join(','),...rows.map(r=>fields.map(k=>q(r[k])).join(','))].join('\r\n'),'text/csv;charset=utf-8');
  toast('Exported patient-level current and historical flow states.');
}
function actionCard(n,title,description,mode) {return `<button class="insight-card" data-go="worklist" data-mode="${mode}"><span class="insight-number">${n}</span><span><h3>${title}</h3><p>${description}</p></span><span class="arrow" aria-hidden="true">↗</span></button>`;}
function worklist(rows,s) {
  const q=M.queue(rows,ASOF,queueMode).filter(p=>p.patient_id.toLowerCase().includes(queueSearch.toLowerCase()));
  const pages=Math.max(1,Math.ceil(q.length/12)); queuePage=Math.min(queuePage,pages-1);
  const displayed=q.slice(queuePage*12,(queuePage+1)*12);
  const modeOptions=[['navigation','Over 90 days · no colonoscopy'],['escalation','Over 180 days · escalation review'],['referral','Over 14 days · referral missing'],['closure','Colonoscopy done · closure pending'],['unassigned','Positive FIT · no assigned owner'],['all','All unresolved positive results'],['kits','Over 30 days · kit not returned'],['invalid','Invalid FIT · review needed']];
  return `${commonKpis(s)}<section class="panel"><div class="panel-head"><div><h2>Your follow-up queue <span class="badge">${q.length} cases</span></h2><p>Longest time waiting first. Language, insurance and race never determine priority.</p></div><span class="label-pill">HUMAN REVIEW</span></div><div class="queue-toolbar"><label><span class="sr-only">Worklist type</span><select id="queue-mode">${modeOptions.map(([v,t])=>`<option value="${v}" ${queueMode===v?'selected':''}>${t}</option>`).join('')}</select></label><label style="flex:1"><span class="sr-only">Search synthetic patient ID</span><input id="queue-search" type="search" placeholder="Search synthetic ID, e.g. SYN-00123" value="${esc(queueSearch)}" style="width:100%"></label></div><div class="table-scroll"><table><caption class="sr-only">${q.length} synthetic cases needing follow-up</caption><thead><tr><th>Patient / location</th><th>Days since ${queueMode==='kits'||queueMode==='invalid'?'order':'positive FIT'}</th><th>Current milestone</th><th>Attention needed</th><th>Owner</th><th>Preferred language</th></tr></thead><tbody>${displayed.map(p=>{
    const flags=M.flags(p,ASOF), badge=flags.includes('180-day escalation')?'danger':'warning';
    return `<tr><td><button class="patient-link" data-patient="${p.patient_id}">${p.patient_id} ↗</button><div class="patient-sub">${p.age} years · ${esc(p.county)} County</div></td><td><span class="days-value">${M.days((queueMode==='kits'||queueMode==='invalid')?p.order_date:p.positive_date,ASOF)}</span></td><td>${esc(M.stage(p))}${p.scheduled_date&&!p.colonoscopy_date?`<div class="patient-sub">Scheduled ${p.scheduled_date}</div>`:''}</td><td><span class="badge ${badge}">${esc(flags.find(f=>f==='180-day escalation')||flags[0]||'Review next step')}</span></td><td>${esc(p.owner)}</td><td>${esc(p.language)}</td></tr>`;
  }).join('')}</tbody></table>${!q.length?'<div class="empty"><strong>No matching cases</strong>Try a different queue, patient ID or cohort filter.</div>':''}</div><div class="table-footer"><span>${q.length?queuePage*12+1:0}–${Math.min((queuePage+1)*12,q.length)} of ${q.length} cases · fixed snapshot 6 Nov 2026</span><div class="pagination"><button id="prev-page" ${queuePage===0?'disabled':''} aria-label="Previous page">←</button><button id="next-page" ${queuePage>=pages-1?'disabled':''} aria-label="Next page">→</button></div></div></section><div class="note section-gap">“Not recorded” does not prove care was never received. Verify outside-provider completion, cancellations and referral acceptance before contacting a patient. Sending a reminder does not close a case.</div>`;
}
function histogram(done) {
  const bins=Array.from({length:12},(_,i)=>({start:i*30,end:(i+1)*30,n:0}));
  done.forEach(p=>{const d=M.days(p.positive_date,p.colonoscopy_date); const idx=Math.max(0,Math.min(11,Math.ceil(d/30)-1)); bins[idx].n++;});
  const max=Math.max(5,...bins.map(b=>b.n)), x0=40,y0=210,w=660,h=165,bw=w/12;
  let svg=`<svg class="histogram" viewBox="0 0 730 275" role="img" aria-label="Histogram of observed time to colonoscopy. Completed cases only; unresolved cases are excluded.">`;
  for(let i=0;i<=4;i++){let val=Math.ceil(max*i/4),y=y0-h*val/max;svg+=`<line x1="${x0}" y1="${y}" x2="${x0+w}" y2="${y}" stroke="#eae3e7"/><text x="28" y="${y+4}" text-anchor="end" font-size="10" fill="#8a7d86">${val}</text>`;}
  bins.forEach((b,i)=>{const bh=b.n/max*h;svg+=`<rect x="${x0+i*bw+5}" y="${y0-bh}" width="${bw-10}" height="${bh}" rx="3" fill="${i<6?'#986b89':'#cea886'}"><title>${b.start===0?'0':b.start+1}–${i===11?'360+':b.end} days: ${b.n} completed cases</title></rect><text x="${x0+(i+.5)*bw}" y="${y0-bh-7}" text-anchor="middle" font-size="10" fill="#73566a">${b.n||''}</text>`;});
  for(let i=0;i<=12;i+=2)svg+=`<text x="${x0+i*bw}" y="232" text-anchor="middle" font-size="10" fill="#8a7d86">${i===12?'360+':i*30}</text>`;
  svg+=`<line x1="${x0+6*bw}" y1="27" x2="${x0+6*bw}" y2="214" stroke="#70425d" stroke-dasharray="5 4"/><text x="${x0+6*bw+8}" y="20" font-size="10" fill="#633a58">180-day project window</text><text x="370" y="265" font-size="10" text-anchor="middle" fill="#8a7d86">Days from positive FIT to recorded colonoscopy</text></svg>`;
  return svg;
}
function timing(rows,s) {
  const done=rows.filter(p=>M.positive(p)&&p.colonoscopy_date), unresolved=rows.filter(p=>M.positive(p)&&!p.colonoscopy_date);
  const ranges=[[0,30],[31,90],[91,180],[181,Infinity]];
  return `${commonKpis(s)}<div class="layout-two"><section class="panel"><div class="panel-head"><div><h2>Time to recorded colonoscopy</h2><p>Completed cases only · ${done.length} observed procedures</p></div></div><div class="chart-wrap"><div class="legend"><span><i></i>Within 180 days</span><span class="late"><i></i>After 180 days</span></div>${done.length?histogram(done):'<div class="empty"><strong>No completed cases</strong>Change the cohort filters to see a distribution.</div>'}</div><div class="mini-stats"><div class="mini-stat"><strong>${s.median==null?'—':s.median+' days'}</strong>median among completers</div><div class="mini-stat"><strong>${s.late}</strong>completed after the window</div></div></section><section class="panel"><div class="panel-head"><div><h2>Still waiting for care</h2><p>${unresolved.length} positive cases without recorded colonoscopy</p></div></div><div class="panel-body">${ranges.map(([a,b])=>{const n=unresolved.filter(p=>{let d=M.days(p.positive_date,ASOF);return d>=a&&d<=b;}).length;return `<div class="bar-row"><span>${b===Infinity?'Over 180':a+'–'+b} days</span><div class="stage-track"><i style="width:${unresolved.length?n/unresolved.length*100:0}%;background:${a>180?'#b76d75':'#a57c95'}"></i></div><strong style="text-align:right">${n}</strong></div>`;}).join('')}<p class="chart-note">Elapsed time is measured at the snapshot. These are unresolved observations, not measured procedure delays.</p><button class="button secondary section-gap" data-go="worklist">Review waiting cases →</button></div></section></div><div class="note section-gap"><strong>Two views, two denominators.</strong> The histogram describes observed completers; its median is not a population median or a survival estimate. The primary 180-day rate uses ${s.mature} positives with a full observation window and excludes all ${s.recent} recent positives, including any already completed.</div>`;
}
function mapSVG() {
  const features=D.geography.features, coords=features.flatMap(f=>f.geometry.type==='Polygon'?f.geometry.coordinates.flat():f.geometry.coordinates.flat(2));
  const xs=coords.map(c=>c[0]),ys=coords.map(c=>c[1]),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
  const projection=([x,y])=>[18+(x-minX)/(maxX-minX)*530,18+(maxY-y)/(maxY-minY)*310];
  const vals=D.places.map(p=>p.screening_rate),lo=Math.min(...vals),hi=Math.max(...vals);
  return `<svg class="map" viewBox="0 0 566 348" role="group" aria-label="Iowa county colorectal cancer screening estimates. Select a county to inspect its value.">${features.map(f=>{
    const p=D.places.find(p=>p.fips===f.id); const t=p?(p.screening_rate-lo)/(hi-lo):0;
    const color=p?`rgb(${Math.round(241-142*t)},${Math.round(226-168*t)},${Math.round(232-144*t)})`:'#ddd';
    const polygons=f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.coordinates;
    const d=polygons.map(poly=>poly.map(ring=>ring.map((c,i)=>(i?'L':'M')+projection(c).map(n=>n.toFixed(1)).join(',')).join(' ')+'Z').join(' ')).join(' ');
    return `<path class="county-shape" d="${d}" fill="${color}" data-fips="${f.id}" tabindex="0" role="button" aria-label="${esc(p?.county||f.id)} County, ${p?p.screening_rate+' percent':'no estimate'}"><title>${esc(p?.county)}: ${p?.screening_rate}%</title></path>`;
  }).join('')}</svg><div class="map-legend"><span>${lo.toFixed(1)}%</span><span class="color-ramp"></span><span>${hi.toFixed(1)}%</span><span>Crude prevalence</span></div>`;
}
function mapDetail(fips) {
  const p=D.places.find(p=>p.fips===fips); if(!p)return;
  $('#map-detail').innerHTML=`<div class="eyebrow">REAL PUBLIC AGGREGATE</div><h3>${esc(p.county)} County</h3><div class="map-value">${p.screening_rate.toFixed(1)}%</div><p>Up to date with colorectal cancer screening, ages 45–75.</p><p style="margin-top:12px">95% interval: ${p.lower_ci}–${p.upper_ci}%<br>FIPS ${p.fips} · ${p.year} source data</p><p class="chart-note">Model-based estimate, not a count of patients. This is not a FIT follow-up completion rate.</p>`;
}
function equity(rows,s) {
  const groups=M.groups(rows,groupField,ASOF); const opts=[['language','Preferred language'],['insurance','Insurance'],['county','County'],['age_band','Age group'],['sex','Sex'],['race','Race'],['ethnicity','Ethnicity']];
  return `<div class="kpis">${kpi('180-day completion',pct(s.rate),`${s.timely} / ${s.mature} mature positive episodes`,true,s.rate)}${kpi('No booking recorded',pct(M.rate(s.noBooking,s.mature)),`${s.noBooking} / ${s.mature} mature positive episodes`)}${kpi('Groups in view',groups.length,'Descriptive comparisons · no adjustment')}${kpi('Real county context','99','Iowa counties · independent public data')}</div><section class="panel"><div class="panel-head"><div><h2>Who is reaching follow-up?</h2><p>Synthetic 180-day completion, with every denominator visible</p></div><label><span class="sr-only">Compare groups by</span><select id="group-field">${opts.map(([v,t])=>`<option value="${v}" ${v===groupField?'selected':''}>${t}</option>`).join('')}</select></label></div><div class="panel-body">${groups.length?groups.map(g=>`<div class="equity-row"><div>${esc(g.name)}${g.mature<20?'<br><span class="small-sample">SMALL SYNTHETIC GROUP</span>':''}</div><div class="stage-track" role="img" aria-label="${esc(g.name)} ${pct(g.rate)}"><i style="width:${(g.rate||0)*100}%"></i></div><span class="equity-value">${pct(g.rate)}</span><span class="equity-n">${g.timely} / ${g.mature}<br>completed / eligible</span></div>`).join(''):'<div class="empty">No matching cases.</div>'}<p class="chart-note">These differences are generated by a fictional scenario and small sample variation. They do not establish disparities, causal effects or real-world intervention benefit. “—” means no eligible denominator; small groups are flagged below n = 20.</p></div></section><section class="panel section-gap"><div class="panel-head"><div><div class="eyebrow" style="margin-bottom:6px">PUBLIC HEALTH CONTEXT · SEPARATE DATASET</div><h2>Screening coverage across Iowa</h2><p>CDC PLACES · 2025 release · 2022 source year · all 99 counties</p></div><a class="subtle-link" href="${D.meta.places.url}" target="_blank" rel="noopener">Source ↗</a></div><div class="panel-body"><div class="map-layout"><div>${mapSVG()}</div><div id="map-detail" class="map-detail"></div></div><p class="chart-note">Select a county on the map, or use Tab and Enter. This map stays unchanged by the synthetic cohort filters. Geography: U.S. Census-derived county boundaries distributed by Plotly. U.S. context is illustrative, not evidence about Abu Dhabi.</p></div></section>`;
}
function render() {
  const rows=filtered(),s=M.summarize(rows,ASOF),h=headings[page];
  $('#eyebrow').textContent='POPULATION HEALTH / '+h[0]; $('#page-title').textContent=h[1]; $('#page-subtitle').textContent=h[2];
  $('#filter-count').textContent=number(rows.length)+' / 5,000 synthetic people';
  $('#nav-count').textContent=M.summarize(patients(),ASOF).overdue;
  document.querySelectorAll('[data-page]').forEach(b=>{const active=b.dataset.page===page;b.classList.toggle('active',active);if(active)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
  $('.snapshot').innerHTML=page==='scenarios'?'Simulation experiment <strong>Full 180-day follow-up</strong>':'Snapshot <strong>06 Nov 2026</strong>';
  $('.filters').hidden=['models','scenarios'].includes(page);$('#export-btn').hidden=['models','scenarios'].includes(page);
  $('#content').innerHTML=page==='scenarios'?window.LoopScenarioLab.render(simulationState):page==='models'?window.LoopModelLab.render(modelCapacity):page==='cascade'?cascade(s):page==='worklist'?worklist(rows,s):page==='timing'?timing(rows,s):equity(rows,s);
  if(page==='equity')mapDetail('19103');
}
function caseHTML(p) {
  const flags=M.flags(p,ASOF),events=session.events.filter(e=>e.patient_id===p.patient_id).slice().reverse();
  const milestones=[['FIT ordered',p.order_date],['Kit returned',p.return_date],['FIT result: '+p.fit_result,p.result_date],['Result communicated',p.notification_date],['Patient acknowledgement',p.acknowledged_date],['Referral placed',p.referral_date],['Receiving provider accepted',p.referral_accepted_date],['Consultation recorded',p.consultation_date],['Appointment booked',p.booking_date],['Colonoscopy completed',p.colonoscopy_date],['Pathology '+(!p.specimen_collected&&p.colonoscopy_date?'— no specimen; N/A':''),p.pathology_date],['Follow-up plan documented',p.plan_date],['Closure reviewed by clinician',p.closure_review_date]];
  return `<div class="dialog-heading"><div><div class="eyebrow">SYNTHETIC CASE / ${esc(M.stage(p).toUpperCase())}</div><h2 id="case-title">${p.patient_id}</h2><p class="small">${p.age} years · ${esc(p.sex)} · ${esc(p.county)} County</p></div><button class="icon-button" data-close="case-dialog" aria-label="Close patient detail">×</button></div><div class="case-meta"><span class="badge neutral">${esc(p.language)}</span><span class="badge neutral">${esc(p.insurance)}</span>${p.positive_date?`<span class="badge">${M.days(p.positive_date,ASOF)} days since positive FIT</span>`:''}</div>${flags.length?`<div class="case-banner">${flags.map(esc).join(' · ')}<br><small>Operational flags for review, not clinical urgency classification.</small></div>`:''}<div class="case-section"><h3>Accountable handoff</h3><div class="field-grid"><label>Case owner<select id="case-owner">${['Navigator A','Navigator B','Navigator C','Unassigned'].map(v=>`<option ${v===p.owner?'selected':''}>${v}</option>`).join('')}</select></label><label>Documented barrier<select id="case-barrier">${['Not assessed','None documented','Transport','Time off work','Language support','Cost / coverage','Unable to reach'].map(v=>`<option ${v===p.barrier?'selected':''}>${v}</option>`).join('')}</select></label></div><button class="button secondary section-gap" id="save-owner">Save ownership & barrier</button></div><div class="case-section"><h3>The evidence trail</h3><ol class="timeline">${milestones.map(([name,date])=>`<li class="${date?'done':''}"><span>${esc(name)}</span><time>${date||'Not recorded'}</time></li>`).join('')}</ol>${p.scheduled_date?`<p class="chart-note">Appointment calendar date: ${p.scheduled_date}. A past appointment without completion evidence requires reconciliation; it is not automatically a no-show.</p>`:''}</div><div class="case-section"><h3>Human-reviewed demo actions</h3><p class="small">All actions below are simulated. Source clinical outcomes stay fixed.</p><div class="dialog-actions">${M.positive(p)&&!p.acknowledged_date?'<button class="button secondary" data-case-action="acknowledge">Record simulated acknowledgement</button>':''}${p.referral_date&&!p.referral_accepted_date?'<button class="button secondary" data-case-action="accept-referral">Record simulated referral acceptance</button>':''}${M.evidenceReady(p)&&!M.closed(p)?'<button class="button secondary" data-case-action="close">Confirm simulated closure review</button>':''}${!M.closed(p)?'<button class="button" id="prepare-draft">Prepare outreach draft</button>':''}</div>${!M.closed(p)&&!M.evidenceReady(p)?'<p class="chart-note">Closure stays unavailable until the procedure, applicable pathology, plan, acknowledgement and owner are recorded. Outreach cannot replace that evidence.</p>':''}<div id="draft-container"></div></div><div class="case-section"><h3>Session audit <span class="badge">${events.length}</span></h3>${events.length?`<ul class="audit-list">${events.map(e=>`<li>${esc(e.detail)}<small>${esc(e.recorded_at)} · Demo reviewer · simulated, no delivery</small></li>`).join('')}</ul>`:'<p class="small">No actions recorded in this browser yet. Historical clinical milestones above are synthetic baseline data.</p>'}</div>`;
}
function openCase(id) {
  const p=patients().find(p=>p.patient_id===id); if(!p)return;
  selectedCase=id;$('#case-content').innerHTML=caseHTML(p); if(!$('#case-dialog').open)$('#case-dialog').showModal();
}
function prepareDraft() {
  const p=patients().find(p=>p.patient_id===selectedCase); if(!p||M.closed(p))return;
  event(p,'draft_created','Outreach draft prepared for human review.');
  openCase(p.patient_id);
  const message=p.fit_result==='negative'?'Please contact your care team about your screening follow-up.':p.fit_result==='invalid'?'Your screening sample needs review. Please contact your care team to discuss the next step.':!p.return_date?'Your care team would like to help you complete your screening kit. Please contact us if you need support.':p.colonoscopy_date?'Your care team would like to review your follow-up plan with you. Please contact us to arrange a conversation.':'Your screening follow-up needs attention. Please contact your care team to discuss the next step and any support you need.';
  $('#draft-container').innerHTML=`<div class="draft"><div class="eyebrow" style="margin-bottom:9px">DRAFT · NEVER SENT FROM THIS PROTOTYPE</div><p>${message}</p><p class="chart-note">Preferred language: ${esc(p.language)}. This English demo template requires language-appropriate review before any real-world use. No contact address is stored.</p><label class="check-label"><input type="checkbox" id="review-confirm">I have reviewed the case, recipient preferences and next step for this simulation.</label><button class="button" id="approve-draft" disabled>Confirm simulated outreach</button></div>`;
  $('#review-confirm').addEventListener('change',e=>$('#approve-draft').disabled=!e.target.checked);
  $('#approve-draft').addEventListener('click',()=>{if(!$('#review-confirm').checked)return;event(p,'outreach_approved','Human approved a simulated outreach action. No message sent.');openCase(p.patient_id);toast('Simulated outreach logged. No message was sent.');});
  $('#draft-container').scrollIntoView({block:'nearest',behavior:'auto'});
}
document.addEventListener('click',e=>{
  const simPolicy=e.target.closest('[data-sim-policy]');if(simPolicy){simulationState.policy=simPolicy.dataset.simPolicy;render();return;}
  const close=e.target.closest('[data-close]');if(close){$('#'+close.dataset.close).close();return;}
  const nav=e.target.closest('[data-page]');if(nav){navigate(nav.dataset.page);return;}
  const go=e.target.closest('[data-go]');if(go){navigate(go.dataset.go,go.dataset.mode);return;}
  const patient=e.target.closest('[data-patient]');if(patient){openCase(patient.dataset.patient);return;}
  const county=e.target.closest('[data-fips]');if(county){mapDetail(county.dataset.fips);return;}
  const gapButton=e.target.closest('[data-gap-stage]');if(gapButton){gapStage=gapButton.dataset.gapStage;showGapCases=true;render();document.querySelector('.gap-case-details')?.scrollIntoView({block:'nearest'});return;}
  if(e.target.closest('#export-flow')){exportFlow();return;}
  const action=e.target.closest('[data-case-action]');if(action){
    const p=patients().find(p=>p.patient_id===selectedCase);if(!p)return;
    if(action.dataset.caseAction==='acknowledge')event(p,'acknowledgement_recorded','Simulated patient acknowledgement recorded.',{notification_date:p.notification_date||ASOF,acknowledged_date:ASOF});
    if(action.dataset.caseAction==='accept-referral'&&p.referral_date)event(p,'referral_accepted','Simulated receiving-provider acceptance recorded.',{referral_accepted_date:ASOF});
    if(action.dataset.caseAction==='close'&&M.evidenceReady(p))event(p,'closure_reviewed','Simulated clinician review completed; evidence prerequisites met.',{closure_review_date:ASOF});
    openCase(p.patient_id);toast('Simulated review recorded in the session audit.');return;
  }
  if(e.target.closest('#save-owner')){const p=patients().find(p=>p.patient_id===selectedCase);const owner=$('#case-owner').value,barrier=$('#case-barrier').value;event(p,'ownership_updated',`Owner: ${p.owner} → ${owner}; barrier: ${barrier}.`,{owner,barrier});openCase(p.patient_id);toast('Case owner and barrier saved locally.');}
  if(e.target.closest('#prepare-draft'))prepareDraft();
  if(e.target.closest('#prev-page')){queuePage--;render();}
  if(e.target.closest('#next-page')){queuePage++;render();}
});
document.addEventListener('keydown',e=>{const c=e.target.closest('[data-fips]');if(c&&(e.key==='Enter'||e.key===' ')){e.preventDefault();mapDetail(c.dataset.fips);}});
document.addEventListener('change',e=>{
  if(e.target.id==='sim-condition'){simulationState.condition=e.target.value;simulationState.patient='';render();}
  if(e.target.id==='sim-policy'){simulationState.policy=e.target.value;render();}
  if(e.target.id==='sim-patient'){simulationState.patient=e.target.value;render();}
  if(e.target.id==='sim-day'){simulationState.day=Number(e.target.value);render();$('#sim-day').focus({preventScroll:true});}
  if(e.target.id==='model-capacity'){modelCapacity=Number(e.target.value);render();$('#model-capacity').focus({preventScroll:true});}
  if(e.target.id==='gap-stage'){gapStage=e.target.value;showGapCases=true;render();}
  if(e.target.id==='queue-mode'){queueMode=e.target.value;queuePage=0;render();}
  if(e.target.id==='group-field'){groupField=e.target.value;render();}
});
document.addEventListener('input',e=>{if(e.target.id==='queue-search'){
  const start=e.target.selectionStart;queueSearch=e.target.value;queuePage=0;render();const input=$('#queue-search');input.focus();try{input.setSelectionRange(start,start);}catch(_){}
}});
for(const field of ['county','language','insurance']){
  const select=$('#'+field+'-filter');[...new Set(D.patients.map(p=>p[field]))].sort().forEach(v=>select.add(new Option(v,v)));
  select.addEventListener('change',()=>{queuePage=0;render();});
}
$('#reset-filters').addEventListener('click',()=>{['county','language','insurance'].forEach(k=>$('#'+k+'-filter').value='');queuePage=0;render();});
$('#export-btn').addEventListener('click',exportCohort);
$('#methods-btn').addEventListener('click',()=>{$('#storage-status').textContent=storageOK?'Demo actions persist in this browser only. Reset removes actions; the baseline cohort stays intact.':'Local storage is unavailable. Actions persist only during this visit.';$('#methods-dialog').showModal();});
$('#mobile-methods-btn').addEventListener('click',()=>$('#methods-btn').click());
$('#export-audit').addEventListener('click',()=>download('loop-simulated-session-audit.json',JSON.stringify({synthetic:true,as_of:ASOF,events:session.events},null,2)));
$('#reset-session').addEventListener('click',()=>{session={changes:{},events:[]};save();render();$('#methods-dialog').close();toast('Demo actions reset. The synthetic baseline is restored.');});
window.addEventListener('hashchange',()=>{const h=location.hash.slice(1);if(headings[h]&&page!==h){page=h;render();}});
render();
