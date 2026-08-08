// Named subsets of the ontology for the explorer's view selector (Phase 3.5
// Milestone 3). Each view is a curated concept-id allowlist, not a strict
// partition -- a concept can appear in more than one view when it's a real
// bridge between them (e.g. Award ties the grant lifecycle to the fund that
// paid for it). Relationships are filtered to those whose subject AND object
// both fall in the visible set, same rule GraphExplorer already applies to
// mini-mode neighborhoods.

export interface ExplorerView {
  id: string;
  label: string;
  description: string;
  /** null means "no filter" -- every concept. */
  conceptIds: string[] | null;
}

// The 15 concepts introduced by Phase 3.5 (Organizational Foundation,
// Milestones 1-2) that didn't exist in the original grantmaking-only model.
const ORGANIZATIONAL_FOUNDATION_CONCEPT_IDS = new Set([
  'organization',
  'organization-role',
  'organization-type',
  'philanthropic-intermediary',
  'funding-intermediary-role',
  'fund',
  'donor-advised-fund',
  'philanthropic-arrangement',
  'fiscal-sponsorship-arrangement',
  'donor-advised-fund-arrangement',
  'regranting-arrangement',
  'collaborative-fund-arrangement',
  'donor-advisor',
  'sponsored-project',
  'grant-recommendation',
]);

export const EXPLORER_VIEWS: ExplorerView[] = [
  {
    id: 'full',
    label: 'Full Ontology',
    description: 'Every concept and relationship in the ontology.',
    conceptIds: null,
  },
  {
    id: 'lifecycle',
    label: 'Grant Lifecycle',
    description:
      'The end-to-end path a grant follows -- from a funder opening a program through closeout -- without the organizational-foundation layer (roles, funds, arrangements) around it.',
    conceptIds: null, // filled in below
  },
  {
    id: 'organizations',
    label: 'Organizations & Roles',
    description:
      'Organizations, the contextual roles they occupy (Funder, Grantee, Fiscal Sponsor, ...), and the classifications and person-level roles around them.',
    conceptIds: [
      'organization',
      'organization-role',
      'organization-type',
      'funder',
      'grantee',
      'fiscal-sponsor',
      'philanthropic-intermediary',
      'funding-intermediary-role',
      'program-officer',
      'reviewer',
      'grant-administrator',
      'donor-advisor',
      'sponsored-project',
    ],
  },
  {
    id: 'funds',
    label: 'Funds & Arrangements',
    description:
      'Funds, Philanthropic Arrangements and their subtypes, and the organizations and awards that connect to them -- the intermediary-philanthropy layer added in Phase 3.5.',
    conceptIds: [
      'organization',
      'organization-role',
      'grant-program',
      'fund',
      'donor-advised-fund',
      'philanthropic-arrangement',
      'fiscal-sponsorship-arrangement',
      'donor-advised-fund-arrangement',
      'regranting-arrangement',
      'collaborative-fund-arrangement',
      'sponsored-project',
      'donor-advisor',
      'grant-recommendation',
      'award',
    ],
  },
  {
    id: 'programs-results-evidence',
    label: 'Programs, Results & Evidence',
    description:
      'The work a grant funds and what it produced or changed -- Project, Need, Population, and the full Input/Activity/Output/Outcome/Impact logic-model chain, its measurement, and the evidence behind any claim about it -- plus the Application/Award/Organization/Report concepts that connect it back to the grantmaking side.',
    conceptIds: [
      'agent',
      'project',
      'need',
      'population',
      'geographic-area',
      'input',
      'activity',
      'result',
      'output',
      'outcome',
      'impact',
      'theory-of-change',
      'logic-model',
      'indicator',
      'target',
      'measurement',
      'evaluation',
      'evidence',
      'evidence-claim',
      'application',
      'award',
      'organization',
      'report',
    ],
  },
  {
    id: 'grant-terms-classification',
    label: 'Grant Terms & Classification',
    description:
      'The normalized model behind a grant agreement\'s restrictions and conditions -- Grant Term and its subtypes -- plus the generic Classification Assignment layer for external taxonomies like Candid\'s Philanthropy Classification System.',
    conceptIds: [
      'grant-term',
      'use-restriction',
      'grant-condition',
      'approval-requirement',
      'reporting-requirement',
      'compliance-requirement',
      'reporting-schedule',
      'matching-requirement',
      'payment-condition',
      'classification-assignment',
      'award',
      'grant-agreement',
      'agent',
      'population',
    ],
  },
];

// "Grant Lifecycle" is everything the original ~48-concept ontology had --
// i.e. everything except the organizational-foundation additions above.
// Filled in here (rather than hand-listed) so it can't silently drift when a
// future concept is added to one side or the other without updating this file.
export function resolveLifecycleView(allConceptIds: string[]): string[] {
  return allConceptIds.filter((id) => !ORGANIZATIONAL_FOUNDATION_CONCEPT_IDS.has(id));
}
