# Loop: care coordination technical notes

Future Health Digital Innovation Challenge · Population Health · Closing the Screening-to-Care Loop

Prepared 18 November 2026. Entrant: Xia (Candice) Wu. This is a synthetic-data research and workflow prototype, not a clinical deployment.

## What a reviewer can use

The public application opens a care coordination workspace: operations overview, patient worklist, tasks and handoffs, team performance, integration monitor, navigator assistant, and review/audit. A separate analysis workspace contains the 5,000-person synthetic cohort, care cascade, patient-level leakage decomposition, time-to-care and subgroup analysis, retrospective prediction and finite-resource policy simulation.

- [Open the prototype](../index.html)
- [Watch the 1 minute 52 second continuous demonstration](../demo.html)
- [Explore the cohort and models](../analysis.html)
- [Detailed analysis methods and results](TECHNICAL_DOCUMENTATION.html)
- [Evidence and source register](SOURCES.html)
- [Official-template submission deck](Loop_Submission_Deck.pdf)

## Two deliberately separate datasets

The analytical cohort contains 5,000 fictional screening episodes, including 246 positive FIT results. The primary denominator is 157 positives with a complete 180-day observation window. Of these, 71 have a recorded colonoscopy within 180 days: 45.2%. The other 89 positives are too recent for that complete-window measure and are excluded from both numerator and denominator.

Of the 86 mature episodes without timely completion, the last documented breakpoint is: 27 without referral, 7 without receiving-provider acceptance, 19 without booking and 33 booked without a completed procedure recorded by day 180. These are record-defined workflow gaps. They are not proven refusals, no-shows or reasons for care noncompletion.

The care workspace uses a separate 12-episode fictional FHIR R4 collection Bundle. It demonstrates operational evidence mapping and review, and does not imply that those 12 cases reproduce the 5,000-person cohort's rates. The CDC PLACES map contains public county aggregates for context only; it is never joined to individual episodes.

## Data flow and implementation

Static browser application → tagged synthetic FHIR Bundle → resource/date/reference checks → episode milestones and navigation tasks → owner/barrier/due-date handoffs → explicit review → session audit. No hospital, live EHR, HL7 v2 transport, SMART authorization, messaging service or clinical AI service is connected.

The mapper supports a narrow subset of Patient, Observation, ServiceRequest, Appointment, Procedure and DiagnosticReport. Final LOINC 12503-9 observations with POS interpretation establish positive FIT. Active ServiceRequest orders represent referrals; booked Appointments represent scheduling; completed SNOMED 73761001 Procedures represent colonoscopy. A final report must be explicitly referenced by the completed Procedure and concern the same patient.

JSON import is limited to 2 MB and 2,000 resources. The Bundle requires a valid timestamp and explicit synthetic tags. Duplicate identities, invalid calendar dates and unmatched subject references reject the import before state replacement. Missing or ambiguous FIT evidence, contradictory chronology, future completion/report evidence and multiple completed procedures are held for reconciliation. Three manual example events demonstrate a referral, booking and procedure arrival.

This is not a full FHIR validator or production integration. External/URN references, multiple episodes per patient, out-of-order versions, corrected records, cross-episode deduplication and pathology-specific reconciliation require an authorized clinical backend. A synthetic tag is a demo convention, not de-identification or permission to import patient data.

## Human review and audit

Outreach is an editable, barrier-aware template. Approval requires a nonempty draft, typed demo reviewer name and explicit attestation to reviewing the draft, patient preference and consent. Approval records the reviewed text; no message is sent. Editing a draft clears its current approval. There is no generative outreach model.

Case closure requires completed procedure evidence, a linked final report, a documented plan, patient acknowledgement, an accountable owner, named review and explicit attestation. Open navigation tasks or unresolved source contradictions block closure. A missing report cannot be bypassed with a pathology N/A selection. Task completion also requires review and a note.

Reviewer identity is simulated, not authenticated. Actions, notes and approvals stay in session memory; refreshing clears them. The exportable log is not immutable or durable. Owner changes synchronize open task handoffs, and valid replacement imports clear prior case state. No patient data are stored in localStorage by the care workspace.

## Knowledge assistant and model boundaries

The navigator assistant uses deterministic keyword retrieval over three curated passages: a cited USPSTF recommendation and two explicitly labeled draft workflow protocols. It reports counts from the current synthetic worklist. It does not implement embeddings, a generative RAG pipeline or institution-approved local guidelines; unsupported questions receive no grounded answer.

The separate day-30 retrospective model is evaluated on later synthetic patients. Logistic regression achieved AUROC 0.681, compared with 0.777 for a simple stage rule. This does not justify clinical risk prioritization. The analysis documents that complexity did not improve ranking.

The finite-resource simulator separates underlying events from records available at decision time and models shared procedure slots and navigator minutes. The evaluation comprises 768 policy runs, 240 task-removal runs and 24 repair checks (1,032 total); additional diagnostic replays are not new independent evidence. Outcomes depend on uncalibrated synthetic assumptions and are not clinical-effect estimates. No simulation output drives clinical actions in the care workspace.

## Verification

All 39 JavaScript checks passed on 18 November 2026, covering the metric denominator, date boundaries, mapping, contradictory evidence, linked reports, handoffs, filters, edited-draft reapproval and import sequencing. Some interaction checks use a DOM stub and do not establish browser layout or clinical validity.

The public browser workflow was also inspected and recorded: analysis, patient lookup, owner/barrier editing, draft approval without sending, blocked closure, manual referral replay and the resulting worklist/audit entries. The accepted demonstration is a continuous screen recording with visible cursor actions, English narration and captions. This is focused functional verification, not comprehensive accessibility, security or clinical validation.

## Before real patient use

A clinical partner must approve the pathway, evidence requirements, contact preferences and authorized access. Deployment needs secure backend integration, robust episode matching, full profile/terminology checks, correction reconciliation, role-based access, authenticated professional review, encryption, durable audit, retention and incident-response procedures. Read-only shadow testing and prospective navigator evaluation must precede outreach or EHR write-back. No clinical partner, compliance certification or clinical benefit is claimed.

## Sources and production materials

- [HL7 FHIR R4 Bundle specification](https://hl7.org/fhir/R4/bundle.html)
- [USPSTF colorectal cancer screening recommendation](https://www.uspreventiveservicestaskforce.org/uspstf/recommendation/colorectal-cancer-screening)
- [Source code and complete analytical documentation](https://github.com/candicewu0515/loop-screening-to-care)
- The application and analysis were developed with AI-assisted coding. Narration was generated locally with Qwen3-TTS and MLX-Audio using an approved fictional AI voice reference; it is not an impersonation of a real person. The video shows the actual prototype, not generated interface footage.
