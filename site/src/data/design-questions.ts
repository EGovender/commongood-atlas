// "Design mode" question set -- see docs/04-roadmap.md Phase 3 and Phase 3.6
// Milestone 5.
//
// This is application logic, not ontology content: it doesn't describe what
// concepts ARE, it encodes a recommendation heuristic ("if you do X, you
// probably need concept Y") on top of concepts that already exist. That's
// why it lives here in site/ rather than in ontology/source/ -- it has
// nothing to export as OWL/RDF.
//
// Design: mostly a flat, independent question list (each yes/no question
// toggles its own concepts in or out, with no effect on other questions) --
// simple to read, explain, and extend. A few follow-up questions are gated
// with `showIf` on a prior answer, but only where asking them unconditionally
// would be nonsensical (e.g. "does review include site visits?" makes no
// sense if there's no review process at all). One question is a single-select
// branch (funding restriction) because "restricted vs. unrestricted" isn't a
// yes/no toggle. This is deliberately NOT a general branching tree -- every
// question's dependency is at most one level deep.
//
// Questions are grouped into named SECTIONS purely for display (a `section`
// id on each question, matching one of DESIGN_SECTIONS) -- sectioning is
// presentation, not a dependency: every question in every section is always
// visible (subject to showIf) and contributes to the same live recommendation,
// there's no wizard-style gating between sections.
import { concepts } from './ontology';

export interface DesignSection {
  id: string;
  label: string;
}

export const DESIGN_SECTIONS: DesignSection[] = [
  { id: 'organization', label: 'Organization & operating model' },
  { id: 'funding-structure', label: 'Funding structure' },
  { id: 'application-review', label: 'Application & review' },
  { id: 'awards-payments', label: 'Awards & payments' },
  { id: 'compliance-outcomes', label: 'Compliance, reporting & outcomes' },
  { id: 'programs-results', label: 'Programs, results & evidence' },
  { id: 'grant-terms-classification', label: 'Grant terms & classification' },
];

export interface BooleanQuestion {
  id: string;
  type: 'boolean';
  section: string;
  text: string;
  help?: string;
  showIf?: { questionId: string; equals: string };
  yes: string[];
  no: string[];
}

export interface SingleSelectOption {
  value: string;
  label: string;
  concepts: string[];
}

export interface SingleSelectQuestion {
  id: string;
  type: 'single-select';
  section: string;
  text: string;
  help?: string;
  showIf?: { questionId: string; equals: string };
  options: SingleSelectOption[];
}

export type DesignQuestion = BooleanQuestion | SingleSelectQuestion;

/** Concepts every grantmaking program needs, regardless of how the questions are answered. */
export const CORE_CONCEPTS: string[] = [
  'organization',
  'organization-role',
  'funder',
  'grantee',
  'program-officer',
  'grant-administrator',
  'grant-program',
  'funding-opportunity',
  'funding-cycle',
  'eligibility-criteria',
  'budget',
  'application',
  'decision',
  'award',
  'grant-agreement',
  'terms-and-conditions',
  'payment',
  'closeout',
  'grant-lifecycle',
];

export const DESIGN_QUESTIONS: DesignQuestion[] = [
  // --- Organization & operating model -------------------------------------
  {
    id: 'fiscal-sponsorship',
    type: 'boolean',
    section: 'organization',
    text: 'Do you (or might you) act as a fiscal sponsor -- providing the legal and administrative infrastructure so a project without its own nonprofit status can receive charitable funding?',
    help: 'Covers both being a fiscal sponsor and the sponsored projects themselves -- the ontology models fiscal sponsorship as a specific kind of Philanthropic Arrangement, not a permanent organization type.',
    yes: ['fiscal-sponsor', 'fiscal-sponsorship-arrangement', 'sponsored-project'],
    no: [],
  },
  {
    id: 'donor-advised-fund',
    type: 'boolean',
    section: 'organization',
    text: 'Do you hold or administer donor-advised funds on behalf of individual donors?',
    help: 'A donor-advised fund is legally controlled by the sponsoring organization -- the donor only holds non-binding privileges to recommend grants and investments from it.',
    yes: ['donor-advised-fund', 'donor-advised-fund-arrangement', 'donor-advisor', 'grant-recommendation'],
    no: [],
  },
  {
    id: 'regranting',
    type: 'boolean',
    section: 'organization',
    text: 'Do you receive funds from another funder and redistribute them to your own sub-grantees?',
    help: 'Regranting means acting as a Grantee to the original source and a Funder (or Funding Intermediary) to the recipients at the same time -- two contextual roles, not a contradiction.',
    yes: ['regranting-arrangement', 'funding-intermediary-role'],
    no: [],
  },
  {
    id: 'collaborative-fund',
    type: 'boolean',
    section: 'organization',
    text: 'Do you pool funds with other funders into a shared fund that you jointly direct?',
    yes: ['collaborative-fund-arrangement', 'fund'],
    no: [],
  },
  {
    id: 'philanthropic-intermediary',
    type: 'boolean',
    section: 'organization',
    text: 'Is facilitating philanthropy on behalf of others -- fiscal sponsorship, regranting, hosting donor-advised funds -- a core part of what your organization is known for, not just an occasional arrangement?',
    help: 'This is a classification (what kind of organization you commonly are), separate from any specific role you occupy in a given arrangement.',
    yes: ['philanthropic-intermediary'],
    no: [],
  },
  {
    id: 'multi-role',
    type: 'boolean',
    section: 'organization',
    text: 'Does your organization take on more than one of these roles at once -- for example, acting as a funder for your own programs while also serving as a fiscal sponsor or grantee elsewhere?',
    help: 'This is the case CommonGood Atlas\'s Organization Role model exists for: the same organization holds multiple, independently-dated role occupancies rather than one permanent type.',
    yes: ['philanthropic-arrangement'],
    no: [],
  },
  {
    id: 'organization-type',
    type: 'boolean',
    section: 'organization',
    text: "Do you need to track an organization's legal and tax classification (e.g., public charity, private foundation, government entity) separately from the role it plays?",
    yes: ['organization-type'],
    no: [],
  },

  // --- Funding structure ---------------------------------------------------
  {
    id: 'uses-funds',
    type: 'boolean',
    section: 'funding-structure',
    text: 'Do you track specific pools of money (funds) separately from the grant programs or strategies they support?',
    help: 'A Grant Program is a giving strategy or area; a Fund is the financial resource pool backing it -- related, but not the same concept.',
    yes: ['fund'],
    no: [],
  },
  {
    id: 'funding-restriction',
    type: 'single-select',
    section: 'funding-structure',
    text: 'Is the funding you award restricted to a specific purpose, unrestricted, or does it vary by grant?',
    options: [
      { value: 'restricted', label: 'Always restricted', concepts: ['restricted-funding'] },
      { value: 'unrestricted', label: 'Always unrestricted', concepts: ['unrestricted-funding'] },
      { value: 'varies', label: 'Depends on the grant', concepts: ['restricted-funding', 'unrestricted-funding'] },
    ],
  },

  // --- Application & review -------------------------------------------------
  {
    id: 'loi',
    type: 'boolean',
    section: 'application-review',
    text: 'Do you require a Letter of Inquiry (a short screening step) before inviting a full application?',
    yes: ['letter-of-inquiry'],
    no: [],
  },
  {
    id: 'review',
    type: 'boolean',
    section: 'application-review',
    text: 'Do applications go through a formal review and scoring process before a decision is made?',
    yes: ['review', 'review-criteria', 'reviewer'],
    no: [],
  },
  {
    id: 'site-visit',
    type: 'boolean',
    section: 'application-review',
    text: 'Does that review process include site visits?',
    showIf: { questionId: 'review', equals: 'yes' },
    yes: ['site-visit'],
    no: [],
  },

  // --- Awards & payments -----------------------------------------------------
  {
    id: 'matching',
    type: 'boolean',
    section: 'awards-payments',
    text: 'Do grantees need to raise or contribute matching funds?',
    yes: ['matching-requirement'],
    no: [],
  },
  {
    id: 'installments',
    type: 'boolean',
    section: 'awards-payments',
    text: 'Are funds disbursed in multiple installments over time, rather than a single payment?',
    yes: ['payment-schedule', 'installment'],
    no: [],
  },
  {
    id: 'payment-condition',
    type: 'boolean',
    section: 'awards-payments',
    text: 'Must a condition (like a submitted report or a milestone) be met before each installment is released?',
    showIf: { questionId: 'installments', equals: 'yes' },
    yes: ['payment-condition'],
    no: [],
  },
  {
    id: 'amendments',
    type: 'boolean',
    section: 'awards-payments',
    text: 'Might the amount, timeline, or terms need to change after the agreement is signed?',
    yes: ['amendment', 'budget-modification'],
    no: [],
  },

  // --- Compliance, reporting & outcomes ---------------------------------------
  {
    id: 'reporting',
    type: 'boolean',
    section: 'compliance-outcomes',
    text: 'Do grantees need to submit reports (narrative and/or financial) during the grant?',
    yes: ['report', 'reporting-schedule', 'compliance-requirement'],
    no: [],
  },
  {
    id: 'audit',
    type: 'boolean',
    section: 'compliance-outcomes',
    text: 'Do you require independent financial audits for some or all grants?',
    showIf: { questionId: 'reporting', equals: 'yes' },
    yes: ['audit'],
    no: [],
  },
  {
    id: 'indirect-costs',
    type: 'boolean',
    section: 'compliance-outcomes',
    text: 'Do grantees charge indirect/overhead costs against the award?',
    yes: ['indirect-cost-rate'],
    no: [],
  },
  {
    id: 'evaluation',
    type: 'boolean',
    section: 'compliance-outcomes',
    text: 'Do you formally evaluate outcomes or impact after the grant period?',
    yes: ['evaluation', 'result', 'output', 'outcome', 'impact', 'theory-of-change', 'logic-model'],
    no: [],
  },

  // --- Programs, results & evidence -------------------------------------------
  {
    id: 'tracks-project',
    type: 'boolean',
    section: 'programs-results',
    text: 'Do you track the specific project or program a grant funds, separately from the application requesting it and the award committing to it?',
    help: 'Application = the request, Award = the funding commitment, Project = the work actually performed -- three distinct concepts kept explicitly separate.',
    yes: ['project'],
    no: [],
  },
  {
    id: 'tracks-need-population',
    type: 'boolean',
    section: 'programs-results',
    text: "Do you track the need, population, or geographic area a project addresses?",
    showIf: { questionId: 'tracks-project', equals: 'yes' },
    yes: ['need', 'population', 'geographic-area'],
    no: [],
  },
  {
    id: 'tracks-activities',
    type: 'boolean',
    section: 'programs-results',
    text: "Do you track the specific activities, resources, and outputs that make up a project's work?",
    showIf: { questionId: 'tracks-project', equals: 'yes' },
    yes: ['input', 'activity', 'result', 'output'],
    no: [],
  },
  {
    id: 'tracks-indicators',
    type: 'boolean',
    section: 'programs-results',
    text: 'Do you set measurable targets for outcomes and track whether you actually hit them?',
    help: 'Kept as two distinct concepts, never merged: a Target is what you planned for, a Measurement is what was actually observed.',
    yes: ['indicator', 'target', 'measurement'],
    no: [],
  },
  {
    id: 'tracks-evidence',
    type: 'boolean',
    section: 'programs-results',
    text: 'When you evaluate results, do you need to record how strong the evidence is and whether it shows association, contribution, attribution, or causation?',
    help: "This is where CommonGood Atlas keeps a specific causal interpretation an explicit, sourced, gradable claim rather than a plain graph fact.",
    yes: ['evidence', 'evidence-claim'],
    no: [],
  },

  // --- Grant terms & classification -------------------------------------------
  {
    id: 'use-restrictions',
    type: 'boolean',
    section: 'grant-terms-classification',
    text: 'Do grant agreements restrict how, where, or for what purpose funds may be used -- e.g., tied to a specific project, or barred from certain uses like lobbying?',
    help: 'Modeled as a Grant Term whose original clause text is preserved alongside structured fields -- this normalizes, but never discards, the source language.',
    yes: ['grant-term', 'use-restriction'],
    no: [],
  },
  {
    id: 'grant-conditions',
    type: 'boolean',
    section: 'grant-terms-classification',
    text: 'Do awards carry conditions tied to a measurable barrier the grantee must clear -- like a matching-funds target or a performance threshold -- with a defined consequence if it isn\'t met?',
    help: 'Matching Requirement and Payment Condition are both concrete kinds of Grant Condition already in the ontology.',
    yes: ['grant-condition'],
    no: [],
  },
  {
    id: 'approval-requirements',
    type: 'boolean',
    section: 'grant-terms-classification',
    text: 'Must grantees get your prior approval before taking certain actions -- like reallocating a large share of the budget, changing key personnel, or extending the timeline?',
    help: 'Approval sought before the action, distinct from a report describing it afterward.',
    yes: ['approval-requirement'],
    no: [],
  },
  {
    id: 'external-classification',
    type: 'boolean',
    section: 'grant-terms-classification',
    text: "Do you classify awards, populations, or other resources using an external taxonomy -- such as Candid's Philanthropy Classification System -- alongside your own concepts?",
    help: 'A Classification Assignment records what an external taxonomy says about a resource without making that taxonomy part of the core ontology, or treating its terms as a substitute for your own Need/Population/Issue Area.',
    yes: ['classification-assignment'],
    no: [],
  },
];

// Fail fast on a typo'd concept id rather than silently recommending nothing.
const conceptIds = new Set(concepts.map((c) => c.id));
function checkIds(ids: string[], where: string) {
  for (const id of ids) {
    if (!conceptIds.has(id)) throw new Error(`design-questions.ts: unknown concept "${id}" in ${where}`);
  }
}
checkIds(CORE_CONCEPTS, 'CORE_CONCEPTS');
const sectionIds = new Set(DESIGN_SECTIONS.map((s) => s.id));
for (const q of DESIGN_QUESTIONS) {
  if (!sectionIds.has(q.section)) {
    throw new Error(`design-questions.ts: question "${q.id}" has unknown section "${q.section}"`);
  }
  if (q.type === 'boolean') {
    checkIds(q.yes, `question "${q.id}" (yes)`);
    checkIds(q.no, `question "${q.id}" (no)`);
  } else {
    for (const opt of q.options) checkIds(opt.concepts, `question "${q.id}" option "${opt.value}"`);
  }
}
