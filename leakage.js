/* Patient-level, mutually exclusive gap accounting. No imputed reasons or outcomes. */
(function(root, factory) {
  const api = factory(typeof module === 'object' && module.exports ? require('./metrics.js') : root.LoopMetrics);
  if (typeof module === 'object' && module.exports) module.exports = api; else root.LoopLeakage = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(M) {
  'use strict';
  const stages = [
    {id:'positive_to_referral',label:'Positive FIT → referral',zh:'阳性 → 转诊',action:'Verify the referral record; assign follow-up ownership.'},
    {id:'referral_to_acceptance',label:'Referral → receiving-provider acceptance',zh:'转诊 → 接诊确认',action:'Confirm receipt, acceptance and accountable provider.'},
    {id:'acceptance_to_booking',label:'Accepted referral → appointment',zh:'接诊确认 → 预约',action:'Review scheduling access and the documented support need.'},
    {id:'appointment_to_procedure',label:'Appointment → completed colonoscopy',zh:'预约 → 检查完成',action:'Separate dates beyond the window from due appointments without completion evidence.'}
  ];
  const plusDays = (date,n) => new Date(Date.parse(date+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
  const observed = (p,key,cutoff) => !!p[key] && p[key] <= cutoff;
  function gap(p,cutoff) {
    if (!M.positive(p) || p.positive_date>cutoff) return null;
    if (observed(p,'colonoscopy_date',cutoff)) return {stage:'complete',detail:'procedure_recorded',waiting_days:0};
    if (observed(p,'booking_date',cutoff)) return {
      stage:'appointment_to_procedure',
      detail:!p.scheduled_date?'appointment_date_not_recorded':p.scheduled_date>cutoff?'scheduled_after_cutoff':'appointment_due_no_completion_record',
      waiting_days:M.days(p.booking_date,cutoff)
    };
    if (observed(p,'referral_accepted_date',cutoff)) return {stage:'acceptance_to_booking',detail:'booking_not_recorded',waiting_days:M.days(p.referral_accepted_date,cutoff)};
    if (observed(p,'referral_date',cutoff)) return {stage:'referral_to_acceptance',detail:'acceptance_not_recorded',waiting_days:M.days(p.referral_date,cutoff)};
    return {stage:'positive_to_referral',detail:'referral_not_recorded',waiting_days:M.days(p.positive_date,cutoff)};
  }
  function closureGap(p) {
    if(!p.colonoscopy_date)return null;
    if(M.closed(p))return 'closed';
    // Priority is an accounting convention; independent missing evidence is also reported below.
    if(p.specimen_collected&&!p.pathology_date)return 'pathology_not_recorded';
    if(!p.plan_date)return 'plan_not_recorded';
    if(!p.acknowledged_date)return 'acknowledgement_not_recorded';
    if(!p.owner||p.owner==='Unassigned')return 'owner_unassigned';
    return 'human_review_not_recorded';
  }
  function classify(p,asOf) {
    let currentRoute;
    if(!p.return_date)currentRoute=M.days(p.order_date,asOf)>30?'kit_return_overdue':'kit_return_within_30_days';
    else if(p.fit_result==='pending')currentRoute='result_pending';
    else if(p.fit_result==='invalid')currentRoute='invalid_result_review';
    else if(p.fit_result==='negative')currentRoute='negative_routine_pathway';
    else if(M.closed(p))currentRoute='positive_closed';
    else if(p.colonoscopy_date)currentRoute='procedure_done_closure_pending';
    else currentRoute=gap(p,asOf).stage;
    const mature=M.mature(p,asOf), deadline=mature?plusDays(p.positive_date,180):null;
    const g180=mature?gap(p,deadline):null, now=M.positive(p)?gap(p,asOf):null;
    return {
      patient_id:p.patient_id,age:p.age,age_band:p.age<50?'45–49':p.age<65?'50–64':'65–75',sex:p.sex,race:p.race,ethnicity:p.ethnicity,
      language:p.language,insurance:p.insurance,county:p.county,
      fit_result:p.fit_result,positive_date:p.positive_date,current_route:currentRoute,
      days_since_positive:M.positive(p)?M.days(p.positive_date,asOf):null,
      current_gap_stage:now?.stage??null,current_gap_detail:now?.detail??null,
      days_in_current_open_stage:now?.waiting_days??null,
      full_180_day_observation:mature,day_180_date:deadline,
      day_180_outcome:mature?(g180.stage==='complete'?'completed_on_time':'not_completed_by_day_180'):M.positive(p)?'still_observing':'not_applicable',
      day_180_gap_stage:g180?.stage??null,day_180_gap_detail:g180?.detail??null,
      days_in_open_stage_at_day_180:g180?.waiting_days??null,
      completed_later_after_day_180:mature&&!M.timely(p)&&!!p.colonoscopy_date,
      closure_first_missing:closureGap(p),
      recorded_barrier:p.barrier,
      interruption_evidence:'not_collected',
      reason_interpretation:'Synthetic support-needs label, not an established cause of this gap'
    };
  }
  function tally(rows,key) {
    const counts={};for(const r of rows){const k=r[key]??'not_applicable';counts[k]=(counts[k]||0)+1;}return counts;
  }
  function analyze(rows,asOf) {
    const audit=rows.map(p=>classify(p,asOf)),positive=rows.filter(M.positive),mat=rows.filter(p=>M.mature(p,asOf));
    const matureAudit=audit.filter(p=>p.full_180_day_observation);
    const missed=matureAudit.filter(p=>p.day_180_outcome==='not_completed_by_day_180');
    const currentOpen=audit.filter(p=>p.current_gap_stage && p.current_gap_stage!=='complete');
    const currentCounts=tally(currentOpen,'current_gap_stage'),missCounts=tally(missed,'day_180_gap_stage');
    const countBy180=key=>mat.filter(p=>observed(p,key,plusDays(p.positive_date,180))).length;
    const chain=[['positive',mat.length],['referral',countBy180('referral_date')],['accepted',countBy180('referral_accepted_date')],['booked',countBy180('booking_date')],['procedure',countBy180('colonoscopy_date')]];
    const transitions=stages.map((s,i)=>({...s,entered:chain[i][1],progressed:chain[i+1][1],not_progressed:chain[i][1]-chain[i+1][1],conversion_rate:M.rate(chain[i+1][1],chain[i][1]),not_progressed_rate:M.rate(chain[i][1]-chain[i+1][1],chain[i][1])}));
    const bottlenecks=stages.map(s=>({...s,n:missCounts[s.id]||0,share_of_missed:M.rate(missCounts[s.id]||0,missed.length),share_of_mature:M.rate(missCounts[s.id]||0,mat.length),current_open:currentCounts[s.id]||0}));
    const groupRows=[];
    for(const field of ['language','insurance','county','age_band','sex','race','ethnicity']){
      for(const name of [...new Set(matureAudit.map(p=>p[field]))].sort()){
        const ps=matureAudit.filter(p=>p[field]===name),failed=ps.filter(p=>p.day_180_outcome==='not_completed_by_day_180');
        const counts=tally(failed,'day_180_gap_stage');
        groupRows.push({field,group:name,eligible:ps.length,completed_on_time:ps.length-failed.length,missed:failed.length,completion_rate:M.rate(ps.length-failed.length,ps.length),small_group:ps.length<20,...Object.fromEntries(stages.map(s=>[s.id,counts[s.id]||0]))});
      }
    }
    const barriers=[];
    for(const stage of stages)for(const name of [...new Set(missed.map(p=>p.recorded_barrier))].sort()){
      const n=missed.filter(p=>p.day_180_gap_stage===stage.id&&p.recorded_barrier===name).length;
      if(n)barriers.push({stage:stage.id,barrier:name,n,interpretation:'Synthetic association only; not a causal attribution'});
    }
    const notifications={
      missing_notification:positive.filter(p=>!p.notification_date).length,
      missing_acknowledgement:positive.filter(p=>!p.acknowledged_date).length,
      unassigned_owner:positive.filter(p=>p.owner==='Unassigned').length,
      interpretation:'Overlapping parallel documentation gaps; do not add to the mutually exclusive pathway counts.'
    };
    return {
      meta:{as_of:asOf,synthetic:true,analysis_version:'1.0',observation:'Historical stage reconstructed at each patient\'s positive FIT + 180 calendar days; only fully observed episodes included.'},
      n:rows.length,positive_n:positive.length,mature_n:mat.length,recent_n:positive.length-mat.length,
      timely_n:mat.length-missed.length,missed_n:missed.length,
      late_recovered_n:missed.filter(p=>p.completed_later_after_day_180).length,
      missed_still_open_n:missed.filter(p=>!p.completed_later_after_day_180).length,
      current_open_n:currentOpen.length,current_details:tally(currentOpen,'current_gap_detail'),
      day180_details:tally(missed,'day_180_gap_detail'),
      current_pathway:tally(audit,'current_route'),
      closure_missing:tally(audit.filter(p=>p.closure_first_missing&&p.closure_first_missing!=='closed'),'closure_first_missing'),
      parallel_documentation_gaps:notifications,
      transitions,bottlenecks,subgroups:groupRows,barriers,audit,
      limitation:'No cancellation, refusal, transfer-out, confirmed no-show or verified outside-provider completion events were collected. A missing date cannot identify a true dropout or its cause.'
    };
  }
  return {stages,plusDays,observed,gap,closureGap,classify,tally,analyze};
});
