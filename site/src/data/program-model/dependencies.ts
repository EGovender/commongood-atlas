// Explicit concept dependencies the Program Profile closure engine can't
// derive any other way -- deliberately NOT a general graph-neighbor
// expansion (that would collapse a personalized model back into most of the
// ontology). Before adding a rule here, ask: is this already guaranteed by
// question effects, subClassOf ancestor closure, or foundation concepts? If
// yes, don't add a duplicate rule. See docs/10-program-model-generation.md.
export interface ProgramModelDependency {
  id: string;
  whenConcept: string;
  includeConcepts: string[];
  explanation: string;
}

// Every currently-known case where a question adds a concept whose ontology
// parent isn't otherwise guaranteed to be in scope -- donor-advised-fund
// without fund, matching-requirement without grant-condition,
// approval-requirement without grant-term -- is resolved by ancestor
// closure alone (walking subClassOf), confirmed by
// build-program-profile.test.ts's own regression tests for these exact
// cases. No explicit dependency rule is needed today; this list starts
// empty rather than manufacturing one.
export const PROGRAM_MODEL_DEPENDENCIES: ProgramModelDependency[] = [];
