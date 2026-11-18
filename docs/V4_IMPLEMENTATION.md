# Loop V4 · Care coordination revision

Updated 18 November 2026 in response to organizer screening feedback.

## Implemented

The default application is now a navigator care coordination workspace with an operations overview, searchable worklist, source evidence trail, owner and barrier assignment, integration monitor, cited knowledge retrieval and review audit. The previous 5,000-person cohort, models and finite-resource policy simulator remain at `../analysis.html`; they do not drive clinical decisions in the new workspace.

A separate fixture contains 12 explicitly fictional FIT-positive episodes in a FHIR R4 collection Bundle. It demonstrates Patient, Observation, ServiceRequest, Appointment, Procedure and DiagnosticReport mapping. Three manually replayed events show a referral arriving, an appointment being booked and a completed procedure entering evidence review. All updates remain in session memory. This is not an EHR connection or a real-time feed.

The import accepts a maximum 2 MB JSON file with at most 2,000 resources and requires explicit synthetic tags on all resources. Duplicate identities and unmatched subject references reject the whole bundle before state replacement. A valid replacement clears case approvals and draft state. This is a demonstration convention, NOT de-identification or permission to import health information.

## Supported mapping and limitations

Only final LOINC 12503-9 observations with POS interpretation establish positive FIT. Active ServiceRequest orders represent referrals; booked Appointments represent scheduling; completed SNOMED 73761001 Procedures represent colonoscopy. A final DiagnosticReport contributes evidence for manual review. The parser is a narrow demo mapper, not a full FHIR profile or terminology validator. It does not resolve external/URN references, multiple screening episodes per patient, out-of-order versions, corrected/entered-in-error records, report-to-procedure linkage or deduplication across episodes. Those cases require quarantine/reconciliation in a clinical backend. No HL7 v2 transport or SMART authorization is implemented.

## Human review gates

Outreach is an editable template. A nonempty draft, typed demo reviewer name and explicit review of patient preference/consent are required to approve it. Approval never sends a message. Closure requires a completed procedure, final report explicitly linked by the completed Procedure, nonempty follow-up plan, patient acknowledgement, accountable owner, typed reviewer and review attestation. Missing data blocks closure. Reviewer identity is simulated; there is no authenticated clinical sign-off. A final report is not a substitute for procedure-specific pathology reconciliation in a future clinical deployment.

The in-memory log records timestamps, actions, episode IDs and review names, and can be exported. It is not immutable or durable. Refresh clears the workspace. No patient data are stored in localStorage by this new application, and no network calls, analytics, AI services or messaging services are invoked.

## Knowledge assistant

A deterministic keyword retrieval function searches three curated passages and cites them in the response. One is the USPSTF screening recommendation. The others are clearly labeled draft Loop workflow protocols. Counts are computed from the current synthetic worklist. Outreach uses rule-based templates; there is no generative model, embedding index or implemented RAG pipeline. Out-of-scope questions return no grounded answer. No institution-approved local guidelines have been provided. A future RAG implementation needs approved versioned local documents, constrained retrieval, citation checking, evaluation for unsupported answers and a secure authorized model gateway.

## Before real patient use

An approved clinical partner must provide the care pathway and authorized data access. A backend must implement SMART/OAuth authorization, least privilege, patient/episode matching, FHIR profile/terminology validation, event versioning and correction reconciliation, encrypted transport/storage, RBAC, authenticated professional review, durable audit, retention and incident response. Clinical governance and prospective navigator testing must precede outreach or EHR write-back. This prototype does not claim production readiness, clinical validation, compliance certification or improved patient outcomes.

## Validation and demonstration

`npm test` runs 30 JavaScript checks: eleven new FHIR/workflow/runtime checks and 19 existing cohort/analysis checks. Syntax checks pass for the new scripts. Browser visual/end-to-end verification was blocked by the execution environment: local HTTP binding is denied and browser file URLs are prohibited. No visual QA or production deployment is claimed.

Demo sequence: open Operations overview; inspect DEMO-001; try closure to observe evidence blocking; save an owner and barrier; draft and approve outreach without sending; replay the three FHIR events; review DEMO-004 with source evidence and complete the manual closure checklist; inspect/export Review & audit. Open the separate policy simulation to show the scientific work without presenting it as clinical decision support.

## References

- HL7 FHIR R4 Bundle: https://hl7.org/fhir/R4/bundle.html
- USPSTF colorectal cancer screening: https://www.uspreventiveservicestaskforce.org/uspstf/recommendation/colorectal-cancer-screening
- Existing evidence register: `SOURCES.md`

## V4.1 operational additions

Added a task board with overdue/open/completed filters, named owner and due-date handoffs, and completion requiring an explicit review and note. Case closure additionally blocks while open tasks remain. Each episode now includes notes, a task list and a session activity timeline. The worklist supports multi-select owner assignment and owner filtering; assignments update open task owners. Team performance shows workload, overdue tasks, documented barriers and reconciliation counts, with a downloadable JSON snapshot. These are descriptive demo counts.

FHIR mapping now checks resource IDs, malformed dates and orphan Appointment patient references. Missing or multiple positive-FIT evidence, a missing procedure date, a procedure before FIT or a report before the procedure marks the episode for source reconciliation and blocks closure. This does not replace episode-aware source reconciliation or full FHIR validation.

Tasks use a fixed 18 November demo reference date. Refresh clears the session; import replaces episode tasks and notes. No reminders are delivered.

## Release verification · 18 November 2026

With explicit user release approval, PR #1 was merged as 0264ce4ef06a03c43a90b086424693bd7ee0882d. GitHub Pages workflow 44337772838 completed successfully. On the public HTTPS deployment, the operations dashboard and task board rendered, DEMO-004 opened with source evidence and task list, and attempted closure visibly reported that open navigation tasks must be completed. Desktop screenshot inspection confirmed the two-column review layout. This is a focused smoke check, not exhaustive browser or clinical validation. Competition resubmission, updated PDF deck and recorded video are still pending.

## Independent code review · V4.2

Current application code was re-read and assessed without prior conversational assumptions. Regression scenarios were added for report linkage, report-bypass rejection, snapshot-relative chronology, strict calendar validation, worklist filters, owner handoffs, edited outreach reapproval and concurrent imports (some scenarios share a test).

The imported Bundle now requires a valid timestamp. A final report must be named in the completed Procedure.report references and belong to the same patient. The N/A checkbox was removed from the coordination closure interface: it can no longer waive a missing procedure report. Future completion/report dates and multiple completed procedures are held for reconciliation. The parser remains a demo subset, not a full clinical validator; pathology-specific reconciliation is not implemented.

Queue owner filtering now occurs before counting and rendering. Clear filters resets owner, search, stage and selections. Individual owner changes synchronize open tasks. Task dates and header derive from the source snapshot. Editing approved draft text clears the current review attestation and enables reapproval; the audit records the approved text. Import generation checks prevent stale asynchronous reads from replacing the latest selection, and successful imports reset filters and episode-specific state. Demonstration replay refuses incompatible imported identities rather than throwing. Identity-indexed maps use null prototypes to avoid inherited-key collisions.

This revision has only been verified by automated checks, including DOM-stub interaction tests; those do not establish browser layout or end-to-end correctness. The separate V3 analytic closure rules have not been altered.
