// Data-access layer over the ontology, synced at build time from
// ontology/source/*.json at the repo root (see scripts/sync-ontology-data.mjs
// and docs/05-data-model.md, docs/06-properties-and-rules.md). Nothing here
// should hand-author ontology content -- it only shapes/looks up what's
// already in the JSON.
import conceptsData from './generated/concepts.json';
import relationshipsData from './generated/relationships.json';
import propertiesData from './generated/properties.json';
import businessRulesData from './generated/business-rules.json';
import metaData from './generated/meta.json';
import exampleData from './generated/example.json';
import { getCategory } from './categories';

// Which structural family a concept belongs to -- authored per-concept in
// ontology/source/concepts.json (Phase 3.7 Milestone 1), not derived
// client-side. Used for the graph explorer's shapes/filters and, going
// forward, other kind-aware rendering. `document`/`reference-scheme`/
// `reference-value` aren't used by any concept yet -- reserved for Phase
// 3.7's later milestones (documents and the reference-data/SKOS framework).
export type ConceptKind =
  | 'organization'
  | 'person'
  | 'organization-role'
  | 'person-role'
  | 'fund'
  | 'grant-program'
  | 'arrangement'
  | 'classification'
  | 'process'
  | 'entity'
  | 'document'
  | 'reference-scheme'
  | 'reference-value';

export interface Concept {
  id: string;
  label: string;
  aliases: string[];
  category: string;
  kind: ConceptKind;
  definition: string;
  subClassOf: string | null;
  docRef: string;
  /** Present only on the handful of concepts (mostly Phase 3.5's
   * intermediary-philanthropy layer) with real legal/regulatory nuance this
   * ontology deliberately simplifies -- surfaced as a callout on the
   * concept's Overview tab, not a general-purpose annotation field. */
  legalNote?: string;
  /** True for a concept superseded by a newer mechanism (e.g. a reference-
   * data-backed property) without being deleted or having its relationships
   * removed -- surfaced as a badge, same pattern as legalNote. */
  deprecated?: boolean;
}

export interface Relationship {
  id: string;
  subject: string;
  predicate: string;
  object: string;
  label: string;
  description: string;
  docRef: string;
}

export type PropertyGroupSource = 'lifecycle' | 'financial' | 'governance' | 'classification';
export type PropertyDatatype = 'string' | 'decimal' | 'date' | 'boolean' | 'enum' | 'reference';

export interface Property {
  id: string;
  concept: string;
  name: string;
  label: string;
  group: PropertyGroupSource;
  datatype: PropertyDatatype;
  /** Present only when datatype is 'reference' -- the id of the
   * ontology/source/reference-data/*.json scheme this property's values are
   * drawn from (Phase 3.7 Milestone 3), in place of a hand-authored
   * allowedValues list. See ./reference-data.ts. */
  referenceScheme?: string;
  required: boolean;
  cardinality: 'one' | 'many';
  allowedValues: string[] | null;
  /** Numeric bounds on a 'decimal' property, where properties.json declares
   * them (e.g. a percentage capped at 0-100) -- absent for most properties. */
  minValue?: number;
  maxValue?: number;
  description: string;
}

export interface BusinessRule {
  id: string;
  label: string;
  description: string;
  concepts: string[];
  docRef: string;
}

export interface ExampleIndividual {
  id: string;
  concept: string;
  label: string;
  properties: Record<string, string>;
  narrative: string;
  /** Marks the first individual of a new narrative thread within the worked
   * example (e.g. "A Fiscal Sponsorship Engagement"); the Story page renders
   * a heading whenever this changes. Individuals within a thread after the
   * first omit it. */
  act?: string;
}

export interface ExampleRelationshipEntry {
  predicate: string;
  subject: string;
  object: string;
}

export interface WorkedExample {
  id: string;
  title: string;
  summary: string;
  individuals: ExampleIndividual[];
  relationships: ExampleRelationshipEntry[];
}

export const concepts = conceptsData as Concept[];
export const relationships = relationshipsData as Relationship[];
export const properties = propertiesData as Property[];
export const businessRules = businessRulesData as BusinessRule[];
export const ontologyVersion: string = (metaData as { version: string }).version;
/** Build-time date derived from git history, not hand-maintained -- see sync-ontology-data.mjs. */
export const ontologyLastUpdated: string | null =
  (metaData as { lastUpdated?: string | null }).lastUpdated ?? null;
export const workedExample = exampleData as WorkedExample;

const CONCEPTS_BY_ID = new Map(concepts.map((c) => [c.id, c]));

export function getConcept(id: string): Concept | undefined {
  return CONCEPTS_BY_ID.get(id);
}

const EXAMPLES_BY_CONCEPT = new Map<string, ExampleIndividual[]>();
for (const i of workedExample.individuals) {
  const list = EXAMPLES_BY_CONCEPT.get(i.concept);
  if (list) list.push(i);
  else EXAMPLES_BY_CONCEPT.set(i.concept, [i]);
}

/**
 * The worked example's individuals for this concept, if the scenario touches
 * it -- usually one, but a concept like Organization or Award can appear
 * more than once (e.g. the direct-grant Award and the fiscal-sponsorship
 * Award are both instances of Award), so this returns all of them rather
 * than picking one arbitrarily.
 */
export function getExamplesForConcept(conceptId: string): ExampleIndividual[] {
  return EXAMPLES_BY_CONCEPT.get(conceptId) ?? [];
}

const EXAMPLE_INDIVIDUALS_BY_ID = new Map(workedExample.individuals.map((i) => [i.id, i]));

export function requireExampleIndividual(id: string): ExampleIndividual {
  const i = EXAMPLE_INDIVIDUALS_BY_ID.get(id);
  if (!i) throw new Error(`Unknown example individual id: ${id}`);
  return i;
}

export function requireConcept(id: string): Concept {
  const c = getConcept(id);
  if (!c) throw new Error(`Unknown concept id: ${id}`);
  return c;
}

export interface RelatedConcept {
  relationship: Relationship;
  concept: Concept;
}

/**
 * A concept's id plus every ancestor's id walking up subClassOf, closest
 * first. Shared by getPropertiesForConcept and getOutgoing/IncomingRelationships
 * -- both need "everything this concept structurally is," not just what's
 * declared directly on it, mirroring tools/generate_ontology.py's
 * resolve_properties_by_concept/ancestor_ids.
 */
export function getAncestorChain(conceptId: string): Concept[] {
  const chain: Concept[] = [];
  const seen = new Set<string>();
  let currentId: string | null = conceptId;
  while (currentId && !seen.has(currentId)) {
    const c = getConcept(currentId);
    if (!c) break;
    seen.add(currentId);
    chain.push(c);
    currentId = c.subClassOf;
  }
  return chain;
}

/**
 * Relationships where the given concept is the subject ("this concept ...
 * other concept"), INCLUDING relationships declared on an ancestor concept
 * (e.g. Fiscal Sponsorship Arrangement inherits Philanthropic Arrangement's
 * `administeredBy`) -- under RDFS semantics a subclass instance is also an
 * instance of every ancestor class, so it can use a relationship declared on
 * one. See tools/generate_ontology.py's ancestor_ids for the instance-data
 * side of the same rule.
 */
export function getOutgoingRelationships(conceptId: string): RelatedConcept[] {
  const ancestorIds = new Set(getAncestorChain(conceptId).map((c) => c.id));
  return relationships
    .filter((r) => ancestorIds.has(r.subject))
    .map((r) => ({ relationship: r, concept: requireConcept(r.object) }));
}

/** Relationships where the given concept is the object ("other concept ... this concept"), including inherited ones -- see getOutgoingRelationships. */
export function getIncomingRelationships(conceptId: string): RelatedConcept[] {
  const ancestorIds = new Set(getAncestorChain(conceptId).map((c) => c.id));
  return relationships
    .filter((r) => ancestorIds.has(r.object))
    .map((r) => ({ relationship: r, concept: requireConcept(r.subject) }));
}

/** Concepts whose subClassOf points at the given concept. */
export function getSubtypes(conceptId: string): Concept[] {
  return concepts.filter((c) => c.subClassOf === conceptId);
}

/**
 * Hand-authored attributes for a concept (lifecycle/financial/governance/
 * classification), INCLUDING those inherited from ancestor concepts via
 * subClassOf (e.g. Funder inherits Organization Role's `status`) -- mirrors
 * tools/generate_ontology.py's resolve_properties_by_concept. SHACL's
 * sh:targetClass resolves subclass instances as part of the spec itself, so
 * an instance of Funder is validated against Organization Role's shape too;
 * the site needs to show the same properties the ontology actually
 * requires, not just the ones declared directly on the concept itself.
 */
export function getPropertiesForConcept(conceptId: string): Property[] {
  const byName = new Map<string, Property>();
  for (const c of getAncestorChain(conceptId).reverse()) {
    for (const p of properties.filter((p) => p.concept === c.id)) {
      byName.set(p.name, p);
    }
  }
  return Array.from(byName.values()).sort((a, b) => a.id.localeCompare(b.id));
}

/** Business rules that name this concept, sorted. */
export function getBusinessRulesForConcept(conceptId: string): BusinessRule[] {
  return businessRules
    .filter((r) => r.concepts.includes(conceptId))
    .sort((a, b) => a.id.localeCompare(b.id));
}

const GITHUB_BLOB_BASE = 'https://github.com/EGovender/commongood-atlas/blob/main/';

export function docUrl(docRef: string): string {
  return GITHUB_BLOB_BASE + docRef;
}

const GITHUB_ONTOLOGY_BASE = 'https://github.com/EGovender/commongood-atlas/blob/main/ontology/';

export const machineFormats = [
  { label: 'OWL (Turtle)', href: GITHUB_ONTOLOGY_BASE + 'commongood-atlas.ttl' },
  { label: 'RDF/XML', href: GITHUB_ONTOLOGY_BASE + 'commongood-atlas.rdf' },
  { label: 'N-Triples', href: GITHUB_ONTOLOGY_BASE + 'commongood-atlas.nt' },
  { label: 'JSON-LD', href: GITHUB_ONTOLOGY_BASE + 'commongood-atlas.jsonld' },
];

export const ONTOLOGY_NAMESPACE = 'https://egovender.github.io/commongood-atlas/ontology/';

export function conceptIri(conceptId: string): string {
  return ONTOLOGY_NAMESPACE + conceptId;
}

export function conceptJsonLd(concept: Concept): Record<string, unknown> {
  const node: Record<string, unknown> = {
    '@id': 'npo:' + concept.id,
    '@type': 'owl:Class',
    label: concept.label,
    definition: concept.definition,
    category: concept.category,
  };
  if (concept.aliases.length > 0) node.altLabel = concept.aliases;
  if (concept.subClassOf) node.subClassOf = 'npo:' + concept.subClassOf;
  if (concept.legalNote) node.legalNote = concept.legalNote;
  return node;
}

/** A single row in the Properties/Technical tabs: a label + a value that may
 * itself be a set of constraints (required/cardinality/allowedValues) rather
 * than a plain string. */
export interface DisplayField {
  label: string;
  value: string;
  property?: Property;
  href?: string;
}

export interface DisplayGroup {
  id: string;
  label: string;
  fields: DisplayField[];
}

const GROUP_LABELS: Record<string, string> = {
  identity: 'Identity',
  classification: 'Classification',
  lifecycle: 'Lifecycle',
  financial: 'Financial',
  governance: 'Governance',
  provenance: 'Provenance',
};

/**
 * The Properties tab's groups for a concept. Identity, the base of
 * Classification, and Provenance are always derived from fields the concept
 * already has -- see docs/06-properties-and-rules.md for why those are never
 * hand-authored a second time in properties.json.
 */
export function getPropertyGroups(concept: Concept): DisplayGroup[] {
  const authored = getPropertiesForConcept(concept.id);
  const byGroup = (g: PropertyGroupSource) => authored.filter((p) => p.group === g);
  const category = getCategory(concept.category);
  const parent = concept.subClassOf ? getConcept(concept.subClassOf) : undefined;

  const groups: DisplayGroup[] = [];

  const identityFields: DisplayField[] = [
    { label: 'ID', value: concept.id },
    { label: 'Label', value: concept.label },
    { label: 'Description', value: concept.definition },
  ];
  if (concept.aliases.length > 0) {
    identityFields.splice(2, 0, { label: 'Alternate Labels', value: concept.aliases.join(', ') });
  }
  groups.push({ id: 'identity', label: GROUP_LABELS.identity, fields: identityFields });

  const classificationFields: DisplayField[] = [
    { label: 'Type', value: 'owl:Class' },
    { label: 'Category', value: category.label },
  ];
  if (parent) {
    classificationFields.push({ label: 'Broader Concept', value: parent.label, href: `concepts/${parent.id}` });
  }
  for (const p of byGroup('classification')) {
    classificationFields.push({ label: p.label, value: p.description, property: p });
  }
  groups.push({ id: 'classification', label: GROUP_LABELS.classification, fields: classificationFields });

  for (const groupId of ['lifecycle', 'financial', 'governance'] as const) {
    const props = byGroup(groupId);
    if (props.length === 0) continue;
    groups.push({
      id: groupId,
      label: GROUP_LABELS[groupId],
      fields: props.map((p) => ({ label: p.label, value: p.description, property: p })),
    });
  }

  groups.push({
    id: 'provenance',
    label: GROUP_LABELS.provenance,
    fields: [
      { label: 'Source', value: concept.docRef, href: docUrl(concept.docRef) },
      { label: 'Ontology Version', value: ontologyVersion },
    ],
  });

  return groups;
}
