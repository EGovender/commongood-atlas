// Types for the Program Profile -- the canonical, deterministic intermediate
// representation a Model Your Program answer set is resolved into -- and its
// Conceptual Model projection. See docs/10-program-model-generation.md.
//
// Nothing here hand-authors ontology content: every field is either copied
// from ontology.ts/reference-data.ts's own types or describes *why* a piece
// of the ontology ended up in a particular user's profile. No diagram
// coordinates, no database/table/column concepts -- those belong to a future
// logical/physical layer this profile is designed to make possible, not to
// build.
import type { ConceptKind, PropertyDatatype, PropertyGroupSource } from '../ontology';
import type { IgnoredAnswer } from './answers';

export const PROGRAM_PROFILE_SCHEMA_VERSION = '1.0.0';

export type ConceptInclusionKind = 'foundation' | 'answer' | 'ancestor' | 'dependency';

export interface ConceptInclusionReason {
  kind: ConceptInclusionKind;
  sourceQuestionId?: string;
  sourceQuestion?: string;
  answerValue?: string;
  answerLabel?: string;
  sourceConceptId?: string;
  dependencyRuleId?: string;
  explanation: string;
}

export interface ProgramProfileAnswer {
  questionId: string;
  sectionId: string;
  question: string;
  value: string;
  label: string;
}

export type ProgramProfileIgnoredAnswer = IgnoredAnswer;

export interface ProgramProfileConcept {
  id: string;
  label: string;
  category: string;
  kind: ConceptKind;
  definition: string;
  subClassOf: string | null;
  /** Foundation or answer-selected -- as opposed to pulled in by closure
   * (ancestor/dependency). See ConceptInclusionKind. */
  direct: boolean;
  inclusionKinds: ConceptInclusionKind[];
  reasons: ConceptInclusionReason[];
  deprecated: boolean;
}

export interface ProgramProfileRelationship {
  id: string;
  subject: string;
  predicate: string;
  object: string;
  label: string;
  description: string;
  docRef: string;
}

export interface ProgramProfileProperty {
  id: string;
  name: string;
  label: string;
  group: PropertyGroupSource;
  datatype: PropertyDatatype;
  referenceScheme?: string;
  required: boolean;
  cardinality: 'one' | 'many';
  allowedValues: string[] | null;
  description: string;
  /** The concept the property is actually declared on in properties.json --
   * may differ from every id in appliesToConceptIds when it's inherited. */
  declaredOnConceptId: string;
  /** Every profile concept this property resolves onto (declaring concept
   * plus any selected subtypes that inherit it without overriding it). */
  appliesToConceptIds: string[];
  /** The subset of appliesToConceptIds that inherit rather than declare it. */
  inheritedByConceptIds: string[];
}

export interface ProgramProfileReferenceValue {
  id: string;
  code: string;
  label: string;
  definition: string;
  deprecated: boolean;
}

export interface ProgramProfileReferenceScheme {
  id: string;
  label: string;
  description: string;
  domain: string;
  authorityType: 'internal' | 'external';
  version: string;
  /** Property ids (within this profile) whose values are drawn from this scheme. */
  usedByProperties: string[];
  values: ProgramProfileReferenceValue[];
}

export type BusinessRuleScopeStatus = 'in-scope' | 'related';

export interface ProgramProfileBusinessRule {
  id: string;
  label: string;
  description: string;
  /** The rule's full concept list, as declared in business-rules.json --
   * concepts the rule is ABOUT, not necessarily prerequisites for including it. */
  conceptIds: string[];
  selectedConceptIds: string[];
  missingConceptIds: string[];
  status: BusinessRuleScopeStatus;
  docRef: string;
}

export type ProgramProfileWarningCode =
  | 'deprecated-concept'
  | 'ignored-hidden-answer'
  | 'missing-reference-scheme'
  | 'unknown-concept'
  | 'closure-cycle';

export interface ProgramProfileWarning {
  code: ProgramProfileWarningCode;
  message: string;
  relatedIds?: string[];
}

export interface ProgramProfileStats {
  totalConcepts: number;
  foundationConcepts: number;
  answerSelectedConcepts: number;
  supportingConcepts: number;
  relationships: number;
  properties: number;
  referenceSchemes: number;
  businessRulesInScope: number;
  businessRulesRelated: number;
  answeredQuestions: number;
  applicableQuestions: number;
}

/**
 * The canonical, deterministic intermediate representation: given the same
 * answers + ontology version + closure rules, buildProgramProfile() always
 * returns a deeply-equal ProgramProfile. Time-sensitive data (generatedAt)
 * deliberately lives only in ProgramProfileExportEnvelope, never here.
 */
export interface ProgramProfile {
  profileSchemaVersion: string;
  ontologyVersion: string;

  answers: ProgramProfileAnswer[];
  ignoredAnswers: ProgramProfileIgnoredAnswer[];

  concepts: ProgramProfileConcept[];
  relationships: ProgramProfileRelationship[];
  properties: ProgramProfileProperty[];
  referenceSchemes: ProgramProfileReferenceScheme[];

  businessRules: {
    inScope: ProgramProfileBusinessRule[];
    related: ProgramProfileBusinessRule[];
  };

  stats: ProgramProfileStats;
  warnings: ProgramProfileWarning[];
}

export interface ProgramProfileExportEnvelope {
  generatedAt: string;
  profile: ProgramProfile;
}

// --- Conceptual Model ------------------------------------------------------
// A pure, presentation-agnostic projection of a ProgramProfile (see
// build-conceptual-model.ts). No diagram coordinates, no UI state, no
// database/implementation concepts.

export interface ConceptualModelNode {
  id: string;
  label: string;
  category: string;
  kind: ConceptKind;
  definition: string;
  direct: boolean;
  inclusionKinds: ConceptInclusionKind[];
  reasons: ConceptInclusionReason[];
  propertyCount: number;
  relationshipCount: number;
  deprecated: boolean;
}

export interface ConceptualRelationshipEdge {
  type: 'relationship';
  id: string;
  source: string;
  target: string;
  predicate: string;
  label: string;
  description: string;
}

export interface ConceptualSpecializationEdge {
  type: 'specialization';
  id: string;
  /** subtype */
  source: string;
  /** parent */
  target: string;
  label: 'specializes';
}

export type ConceptualModelEdge = ConceptualRelationshipEdge | ConceptualSpecializationEdge;

export interface ConceptualModel {
  modelType: 'conceptual';
  ontologyVersion: string;
  nodes: ConceptualModelNode[];
  edges: ConceptualModelEdge[];
  stats: {
    nodes: number;
    relationships: number;
    specializations: number;
  };
}
