/* Shared, dependency-free metric definitions for the dashboard and validation. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LoopMetrics = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const days = (a, b) => a && b ? Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000) : null;
  const rate = (n, d) => d ? n / d : null;
  const median = a => { const s = [...a].sort((x,y)=>x-y); const i=Math.floor(s.length/2); return s.length ? (s.length%2?s[i]:(s[i-1]+s[i])/2) : null; };
  const positive = p => p.fit_result === 'positive' && !!p.positive_date;
  const mature = (p, asOf) => positive(p) && days(p.positive_date, asOf) >= 180;
  const timely = p => positive(p) && !!p.colonoscopy_date && days(p.positive_date, p.colonoscopy_date) >= 0 && days(p.positive_date, p.colonoscopy_date) <= 180;
  const evidenceReady = p => !!(p.colonoscopy_date && (!p.specimen_collected || p.pathology_date) && p.plan_date && p.acknowledged_date && p.owner !== 'Unassigned');
  const closed = p => evidenceReady(p) && !!p.closure_review_date;
  function stage(p) {
    if (!p.return_date) return 'Awaiting kit';
    if (p.fit_result === 'invalid') return 'Invalid FIT';
    if (p.fit_result === 'pending') return 'Awaiting result';
    if (p.fit_result === 'negative') return 'Routine screening';
    if (closed(p)) return 'Closed loop';
    if (p.colonoscopy_date) return 'Closure pending';
    if (p.booking_date) return 'Appointment recorded';
    if (p.referral_accepted_date) return 'Referral accepted';
    if (p.referral_date) return 'Referral sent';
    return 'Referral needed';
  }
  function flags(p, asOf) {
    const age = days(p.positive_date, asOf);
    const result = [];
    if (!p.return_date && days(p.order_date, asOf)>30) result.push('Kit overdue');
    if (p.fit_result==='invalid') result.push('Invalid FIT');
    if (!positive(p) || closed(p)) return result;
    if (p.owner==='Unassigned') result.push('Unassigned');
    if (!p.referral_date && age>14) result.push('Referral overdue');
    if (!p.colonoscopy_date && age>180) result.push('180-day escalation');
    else if (!p.colonoscopy_date && age>90) result.push('Navigation due');
    if (!p.colonoscopy_date && p.scheduled_date && p.scheduled_date<asOf) result.push('Appointment reconciliation');
    if (p.colonoscopy_date && days(p.colonoscopy_date,asOf)>14 && !closed(p)) result.push('Closure review due');
    return result;
  }
  function summarize(rows, asOf) {
    const pos = rows.filter(positive), mat = pos.filter(p=>mature(p, asOf));
    const done = pos.filter(p=>p.colonoscopy_date), ontime=mat.filter(timely);
    return {
      n: rows.length, returned: rows.filter(p=>p.return_date).length,
      valid: rows.filter(p=>['positive','negative'].includes(p.fit_result)).length,
      negative: rows.filter(p=>p.fit_result==='negative').length,
      invalid: rows.filter(p=>p.fit_result==='invalid').length,
      positives:pos.length, mature:mat.length, recent:pos.length-mat.length,
      timely:ontime.length, rate:rate(ontime.length,mat.length),
      completed:done.length, late:done.filter(p=>!timely(p)).length,
      median:median(done.map(p=>days(p.positive_date,p.colonoscopy_date))),
      referred:pos.filter(p=>p.referral_date).length, booked:pos.filter(p=>p.booking_date).length,
      noBooking:mat.filter(p=>!p.booking_date).length,
      closed:pos.filter(closed).length,
      overdue:pos.filter(p=>!p.colonoscopy_date && days(p.positive_date,asOf)>90).length,
      escalation:pos.filter(p=>!p.colonoscopy_date && days(p.positive_date,asOf)>180).length,
      noAcknowledgement:pos.filter(p=>!p.acknowledged_date).length,
      noOwner:pos.filter(p=>!closed(p) && p.owner==='Unassigned').length
    };
  }
  function queue(rows, asOf, mode='navigation') {
    return rows.filter(p=> {
      if (mode==='navigation') return positive(p) && !p.colonoscopy_date && days(p.positive_date,asOf)>90;
      if (mode==='escalation') return positive(p) && !p.colonoscopy_date && days(p.positive_date,asOf)>180;
      if (mode==='unassigned') return positive(p) && !closed(p) && p.owner==='Unassigned';
      if (mode==='referral') return positive(p) && !p.referral_date && days(p.positive_date,asOf)>14;
      if (mode==='closure') return positive(p) && !!p.colonoscopy_date && !closed(p);
      if (mode==='kits') return !p.return_date && days(p.order_date,asOf)>30;
      if (mode==='invalid') return p.fit_result==='invalid';
      return positive(p) && !closed(p);
    }).sort((a,b)=>(days(b.positive_date||b.order_date,asOf)-days(a.positive_date||a.order_date,asOf)) || a.patient_id.localeCompare(b.patient_id));
  }
  function groups(rows, field, asOf) {
    const values=[...new Set(rows.map(p=>field==='age_band'?(p.age<50?'45–49':p.age<65?'50–64':'65–75'):p[field]))].sort();
    return values.map(name=>{
      const group=rows.filter(p=>(field==='age_band'?(p.age<50?'45–49':p.age<65?'50–64':'65–75'):p[field])===name);
      return {name,...summarize(group,asOf)};
    });
  }
  return {days,rate,median,positive,mature,timely,evidenceReady,closed,stage,flags,summarize,queue,groups};
});
