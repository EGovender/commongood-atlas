# Core Concepts (v0.2)

This is the working set of core grantmaking and nonprofit-knowledge-model concepts — roughly 90, grouped by where they sit in the grant lifecycle or the organizational model. Each entry is a working definition, not a final one; see [CONTRIBUTING.md](../CONTRIBUTING.md) for how to propose changes.

Definitions are intentionally implementation-agnostic: no field names, no database types. See [Relationships](03-relationships.md) for how these concepts connect, and the [Roadmap](04-roadmap.md) for when machine-readable versions of these will exist.

## Organizational entities

As of Phase 3.7 Milestone 1, this section distinguishes four related-but-different ideas that earlier drafts didn't separate cleanly:

- **Entity vs. role** — an Organization or a Person is a stable, identifiable thing; a Role is a contextual capacity it occupies, which can change, end, or apply only within one arrangement, while the entity itself persists.
- **Person vs. Person Role** — a Person is a natural person; a Person Role (Employee, Reviewer, Donor Advisor, ...) is something a person *occupies*, not a permanent trait of who they are. The same person can hold several Person Roles at once, each independently dated and scoped.
- **Organization vs. Organization Role** — the same distinction, for organizations (see [Organizations, Roles & Arrangements](08-organizations-roles-and-arrangements.md) for the fuller treatment this milestone builds on).
- **Role type vs. role occupancy** — "Funder" or "Employee" as a concept is a reusable role *type*; a specific organization or person actually holding that role in a specific context (with its own start date, status, and scope) is a role *occupancy*. This ontology models occupancies as instances of the role-type concepts, not as a separate layer — see the worked example.

1. **Role** — A contextual capacity an agent (a Person or an Organization) occupies, distinct from the agent's permanent identity or classification. The shared parent of Person Role and Organization Role; carries the properties every role occupancy needs regardless of who holds it (effective dates, status, scope, notes), inherited by every subtype below.
2. **Person** — A natural person who participates in nonprofit, philanthropic, governance, employment, advisory, or service relationships. Also called an individual or natural person. A Person is not itself a role — see Person Role.
3. **Organization** — Any legal entity participating in grantmaking or philanthropy. An organization occupies one or more contextual roles (see Organization Role) rather than being permanently classified as a funder or a recipient.
4. **Person Role** — A contextual capacity a person occupies within an organization, award, application, agreement, arrangement, program, project, or other defined context. The person performing the same function for two different organizations, or in two different capacities for the same organization, holds two separate Person Role occupancies.
5. **Organization Role** — A contextual capacity an organization occupies within a specific arrangement or award — such as acting as a funder, grant recipient, or fiscal sponsor — rather than a permanent trait of the organization itself.
6. **Organization Type** — The legal and tax classification of what an organization fundamentally is (e.g., a public charity, private foundation, or government entity), independent of any role it plays in a specific relationship. Phase 3.7 Milestone 4 splits this into Legal Form, Tax Status, and Organization Classification as governed reference data.
7. **Employee** — The role a person occupies when they work for and are compensated by an organization.
8. **Board Member** — The role a person occupies when they serve on an organization's governing board.
9. **Program Officer** — The role a person occupies when they manage a portfolio of grants on behalf of a funder, from soliciting or reviewing applications through monitoring active awards.
10. **Reviewer** — The role a person occupies when they evaluate an application against review criteria, whether as staff, a board member, or an external peer reviewer.
11. **Grant Administrator** — The role a person occupies when they are responsible for compliance, reporting, and financial management of an award on behalf of the grantee organization.
12. **Donor** — The role a person occupies when they contribute charitable funds to an organization or fund, without necessarily holding advisory privileges over how they are used.
13. **Donor Advisor** — The role a person occupies when they hold non-binding privileges to recommend grants and investments from a Donor-Advised Fund, typically as the fund's original donor.
14. **Applicant Contact** — The role a person occupies when they serve as the primary point of contact for an application submitted on behalf of an organization or project.
15. **Authorized Signatory** — The role a person occupies when they are authorized to sign a grant agreement or other governing document on behalf of an organization.
16. **Consultant** — The role a person occupies when they provide paid, defined-scope services to an organization without being its employee.
17. **Funder** — The role an organization occupies when it provides funding to grantees through grant programs and awards. Also called a grantmaker.
18. **Grantee** — The role an organization occupies when it receives and administers grant funding awarded by a funder. Also called a recipient or subrecipient when funds are re-granted.
19. **Fiscal Sponsor** — The role an organization occupies when it provides the legal and administrative infrastructure that lets another entity or project receive charitable funding on its behalf.
20. **Philanthropic Intermediary** — An organization commonly known for facilitating philanthropy on behalf of others — such as by re-granting, fiscal sponsorship, or hosting donor-advised funds — regardless of which specific role it occupies in a given arrangement.
21. **Funding Intermediary Role** — The role an organization occupies when it channels funds between an original funding source and an ultimate grantee, without itself being the original funder or the final recipient.
22. **Sponsored Project** — A project or group carrying out charitable activity under a Fiscal Sponsor's legal and administrative umbrella, without being itself an independent Organization. As of the Programs, Results & Evidence enhancement, a subtype of Project (below) — it's still the work being performed, just performed under someone else's legal umbrella.

## Funding structure

23. **Grant Program** — A funder's standing area of giving (e.g., "Environmental Justice Grants"), under which funding opportunities are issued over time.
24. **Fund** — A designated pool of financial resources set aside for a purpose, distinct from the grant program or strategy that directs how it's used.
25. **Donor-Advised Fund (DAF)** — A Fund held by a sponsoring organization, over which a Donor Advisor holds non-binding privileges to recommend grants and investments.
26. **Funding Opportunity** — A specific, time-bound invitation to apply for funding under a grant program, with defined eligibility, focus area, and deadlines. Often called an RFP (Request for Proposals) or NOFO (Notice of Funding Opportunity).
27. **Funding Cycle** — A recurring period (e.g., quarterly, annual) within a grant program during which applications are accepted and decided.
28. **Eligibility Criteria** — The conditions an organization or project must meet to apply to a funding opportunity.
29. **Budget** — A structured estimate of costs associated with a proposed or funded project, broken into categories (e.g., personnel, overhead, direct program costs).
30. **Philanthropic Arrangement** — A structured relationship among organizations that channels philanthropic funding outside a direct funder-to-grantee award — such as a fiscal sponsorship or donor-advised fund arrangement.
31. **Fiscal Sponsorship Arrangement** — A Philanthropic Arrangement in which a Fiscal Sponsor accepts and administers charitable funds on behalf of a Sponsored Project that lacks independent legal status to receive them directly.
32. **Donor-Advised Fund Arrangement** — A Philanthropic Arrangement in which a Donor Advisor holds non-binding advisory privileges over grants made from a Donor-Advised Fund.
33. **Regranting Arrangement** — A Philanthropic Arrangement in which an organization receives funds and redistributes them to other organizations, acting as both a Grantee to the original source and a Funder or Funding Intermediary to the recipients.
34. **Collaborative Fund Arrangement** — A Philanthropic Arrangement in which multiple funders pool resources into a shared Fund and jointly direct or oversee its grantmaking.

## Application and review

35. **Letter of Inquiry (LOI)** — A brief, preliminary submission used by some funders to screen interest before inviting a full application.
36. **Application** — A grantee's formal submission requesting funding under a specific funding opportunity, including a proposal narrative and budget.
37. **Review** — The process of evaluating an application, producing a recommendation and often a score, conducted by one or more reviewers.
38. **Review Criteria** — The published or internal standards (e.g., alignment with mission, feasibility, budget reasonableness) against which applications are scored.
39. **Site Visit** — An optional step where a funder representative visits or meets with an applicant to assess capacity or verify claims before a decision.
40. **Decision** — A recorded determination concerning an application following review or another authorized approval process. Its outcome (approved, declined, or approved with conditions) is a property of the Decision, not the Decision's identity itself — see [Relationships](03-relationships.md).
41. **Grant Recommendation** — A Donor Advisor's non-binding request that a Donor-Advised Fund make an award to a specific recipient; the fund's sponsoring organization retains final authority to accept or decline it.

## Award and agreement

As of the Structured Grant Terms enhancement, this section also covers **Grant Term** and its four concrete subtypes (Use Restriction, Grant Condition, Approval Requirement, Reporting Requirement) — a normalized model for what a Grant Agreement's free-text restrictions and conditions actually say, alongside (not replacing) the original clause text. Two concepts that already existed here or elsewhere — **Compliance Requirement** and **Reporting Schedule** — are re-parented under Grant Term rather than duplicated, since each already covered close to what the enhancement asked for; **Matching Requirement** and **Payment Condition** (below, under Disbursement) are similarly re-parented under Grant Condition, since they're the enhancement's own canonical examples of one. See [Relationships](03-relationships.md#grant-terms) for how the family connects to Award and Grant Agreement, and [Properties & Rules](06-properties-and-rules.md) for the reference-data vocabularies behind Use Restriction and Grant Condition.

42. **Award** — A funder's formal commitment to provide a specific amount of funding to a grantee, following an approved application or decision.
43. **Grant Agreement** — The legal document, signed by both funder and grantee, that formalizes an award's terms, conditions, and obligations.
44. **Terms and Conditions** — The specific obligations, restrictions, and expectations attached to an award (e.g., allowable uses of funds, reporting requirements). Its own `restrictionType` property is a coarse restricted/unrestricted flag, superseded for new data by the structured Use Restriction model below — retained for backward compatibility.
45. **Restricted Funding** *(deprecated)* — Funding that must be used for a specific purpose, project, or time period defined in the grant agreement. Superseded for new data by Fund's `restrictionType` property, backed by the [restriction-type reference scheme](06-properties-and-rules.md#phase-37-milestone-3-reference-backed-properties-and-controlled-vocabularies) — kept for backward compatibility, not deleted.
46. **Unrestricted Funding** *(deprecated)* — Funding a grantee may use at its discretion in support of its general mission. Superseded the same way as Restricted Funding, above.
47. **Matching Requirement** — A condition requiring the grantee to raise or contribute additional funds alongside the award, often as a ratio (e.g., 1:1 match). As of the Structured Grant Terms enhancement, a subtype of Grant Condition — a matching requirement is exactly the kind of measurable barrier a Grant Condition models.
48. **Amendment** — A formally agreed change to an existing grant agreement's terms, budget, timeline, or amount, made after the original agreement was signed.
49. **Grant Term** — A normalized representation of a single restriction, condition, obligation, or requirement attached to a Grant Agreement, distinguished from Terms and Conditions' free text by preserving the *original* clause text (`originalTermText`) alongside structured, queryable fields. The abstract parent of Use Restriction, Grant Condition, Approval Requirement, Reporting Requirement, and (re-parented) Compliance Requirement and Reporting Schedule. Every real Grant Term is an instance of one of these concrete subtypes — never the bare abstract concept — so "what kind of term is this" is answered by the instance's own type, not a separate category field.
50. **Use Restriction** — A Grant Term specifying how, where, when, or for what purpose award funds may or may not be used (e.g., restricted to a specific project, prohibited from lobbying). Its `restrictionMode` (required-use / permitted-use / prohibited-use) distinguishes a purpose restriction from a prohibition — a fund earmarked for a project and a fund barred from lobbying are both Use Restrictions, recorded as separate instances with different modes, never conflated into one.
51. **Grant Condition** — A Grant Term that ties a consequence (continued funding, release of a payment, right of return) to a measurable barrier the grantee must clear — a threshold, a milestone, a specified event or protocol — distinct from a Use Restriction, which constrains *how* funds already flowing may be used rather than *whether* they keep flowing. Matching Requirement and Payment Condition (below) are concrete examples already modeled elsewhere in the ontology.
52. **Approval Requirement** — A Grant Term specifying that the grantee must obtain the funder's prior approval before taking a defined action (e.g., reallocating more than a threshold share of the budget, changing key personnel, extending the timeline) — approval sought *before* the action, not merely reported afterward.
53. **Reporting Requirement** — A Grant Term specifying a particular report the grantee must submit (e.g., a quarterly financial report), distinct from the broader Reporting Schedule (below), which sets the overall cadence. One Reporting Schedule can obligate several distinct Reporting Requirements, and a single submitted Report can, in turn, fulfill more than one Reporting Requirement at once.

## Disbursement

54. **Payment Schedule** — The agreed timing and amounts by which award funds will be disbursed to the grantee.
55. **Installment** — A single scheduled portion of an award's total funds, to be disbursed at a defined point or upon meeting a condition.
56. **Payment** — An actual transfer of funds from funder to grantee against an award, corresponding to one or more installments.
57. **Payment Condition** — A requirement (e.g., a submitted report, a milestone reached) that must be satisfied before a scheduled payment is released. As of the Structured Grant Terms enhancement, a subtype of Grant Condition, for the same reason as Matching Requirement above.
58. **Budget Modification** — A grantee-requested, funder-approved change to how awarded funds are allocated across budget categories, without changing the total award amount.

## Compliance and reporting

59. **Compliance Requirement** — An obligation attached to an award that the grantee must satisfy to remain in good standing (e.g., timely reporting, allowable use of funds, insurance). As of the Structured Grant Terms enhancement, a subtype of Grant Term — its own `requirementType` vocabulary was additively expanded rather than replaced, so it keeps functioning as a normal Grant Term while remaining backward compatible with existing data.
60. **Reporting Schedule** — The agreed cadence and due dates for narrative and financial reports over the life of an award. As of the Structured Grant Terms enhancement, also a subtype of Grant Term, distinct from the more granular Reporting Requirement above.
61. **Report** — A grantee's submission to the funder describing progress, outcomes, and/or use of funds, per the reporting schedule. Narrative and financial reports are common subtypes.
62. **Audit** — A formal, independent examination of a grantee's financial records, either as a general organizational requirement or specific to a grant.
63. **Indirect Cost Rate** — The negotiated or de minimis rate at which a grantee may charge overhead/administrative costs against an award.

## Outcomes and closeout

As of the Programs, Results & Evidence enhancement, this section also covers the full Input → Activity → Output → Outcome → Impact logic-model chain, its measurement (Indicator/Target/Measurement), and the evidence supporting any claim about it — see [Relationships](03-relationships.md#programs-results-and-evidence) for how these connect to a Project and to each other, and [Organizations, Roles & Arrangements](08-organizations-roles-and-arrangements.md) for why this doesn't need its own top-level category (a 9th color would exceed the site's validated categorical palette).

64. **Theory of Change** — A grantee's or funder's articulated model of how specific activities are expected to lead to desired long-term change.
65. **Logic Model** — A structured diagram connecting a project's inputs, activities, outputs, and outcomes, used to plan and evaluate a grant-funded project.
66. **Result** — A planned or observed state, product, change, or effect associated with an intervention. The shared parent of Output, Outcome, and Impact, distinguished from each other by directness and time horizon.
67. **Output** — A direct product, service, deliverable, or immediate consequence of Activities carried out by a Project (e.g., number of workshops held, people served). Does not itself imply any broader behavioral or social change. A subtype of Result.
68. **Outcome** — A change in condition, behavior, knowledge, capacity, practice, or status that is intended or observed in association with a Project or Activity, distinct from a direct Output. A subtype of Result. A recorded Outcome does not by itself establish that the Project caused it — see Evidence Claim, below, for how a specific causal or contributory interpretation is represented and evidenced.
69. **Impact** — A broader or longer-term change to which one or more Outcomes may contribute. A subtype of Result. Recording an Impact relationship does not itself imply the Project has been demonstrated to cause the change.
70. **Input** — A financial, human, material, informational, or other resource used in carrying out an Activity.
71. **Activity** — A defined action or body of work performed by a Project to produce Outputs and contribute toward intended Outcomes.
72. **Indicator** — A defined measure used to assess the state or change of a Result (e.g., percentage of participants employed after six months, graduation rate).
73. **Target** — A planned value for an Indicator expected to be reached by a defined point in time. Never interchangeable with a Measurement, below — a Target is planned, a Measurement is observed.
74. **Measurement** — An observed value for an Indicator at a particular time and, where relevant, for a defined Population or Geographic Area.
75. **Evidence** — Information used to support, weaken, qualify, or contextualize a claim about a Project, Activity, Result, or other entity (e.g., an evaluation report, survey results, administrative data, a case study).
76. **Evidence Claim** — A sourced assertion about a relationship, condition, result, or causal interpretation whose evidentiary basis can be independently identified. This is where a specific interpretation of a Project's contribution to a Result — association, contribution, attribution, or causation, see [Properties & Rules](06-properties-and-rules.md) — gets represented, kept explicitly separate from the Result itself and from the Evidence supporting the claim. The mechanism that lets this ontology avoid ever asserting "Project caused Outcome" as a plain graph fact.
77. **Evaluation** — A structured assessment of whether a grant-funded project achieved its intended outputs and outcomes.
78. **Closeout** — The formal conclusion of a grant award once all funds are disbursed, all reports are submitted and accepted, and all compliance requirements are satisfied.
79. **Need** — A condition, problem, gap, or opportunity identified as warranting intervention or investment.
80. **Population** — A group of people defined by demographic, geographic, institutional, experiential, or other characteristics relevant to a Need, Project, Result, or Evaluation.
81. **Geographic Area** — A geographic entity used to describe where a Need exists, where a Project operates, where a Population is located, or where a Result is observed. Not assumed to be the same as a grant recipient's registered mailing address.

## Cross-cutting

As of the Candid PCS Classification enhancement, this section also covers **Classification Assignment** — see [Relationships](03-relationships.md#classification) for how it connects to Award and Population, and [Properties & Rules](06-properties-and-rules.md) for the Candid PCS reference-data schemes it can draw from.

82. **Grant Lifecycle** — The end-to-end sequence a grant moves through, from funding opportunity through application, review, award, disbursement, reporting, and closeout. See [Relationships](03-relationships.md) for the full sequence.
83. **Agent** — An entity capable of participating in an activity, relationship, decision, transaction, or role. The shared parent of Person and Organization, added so future relationships can target either without duplicating a predicate per entity type.
84. **Project** — A defined body of work undertaken over a period of time to address one or more needs or objectives — the work being performed, distinct from the Application requesting funding for it or the Award committing funding to it.
85. **Classification Assignment** — A contextual assertion that a resource (e.g. an Award or a Population) is classified by a concept from a specified external or internal classification scheme, such as Candid's Philanthropy Classification System (PCS). External taxonomies classify CommonGood resources; they do not define those resources — Need, Population, and Organization remain the ontology's own entities regardless of which taxonomy terms are assigned to them. Deliberately generic rather than named after Candid specifically, so any external or internal taxonomy can be imported the same way.

---

This list is a working draft (v0.2), not a final ontology. Open an issue or PR to propose a missing concept, challenge a definition, or suggest a merge/split — see [CONTRIBUTING.md](../CONTRIBUTING.md).
