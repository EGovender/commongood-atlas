// Types for the Logical Model -- a database-independent projection of a
// ProgramProfile into Entities/Attributes/Associations (see
// docs/10-program-model-generation.md's "Logical Model" section and
// docs/04-roadmap.md Phase 3.12). Depends on program-model/, never the
// reverse.
//
// Three things here are documented modeling decisions, not ontology fact,
// because the ontology has no data to source them from -- see
// build-logical-model.ts for where each is applied:
// 1. entityType classification (nothing marks a concept "abstract" anywhere)
// 2. every entity's synthesized `id` Attribute (no natural key is modeled
//    anywhere in properties.json)
// 3. every business Association's cardinality is 'unspecified' (no
//    relationship in relationships.json carries a cardinality field)
import type { PropertyDatatype } from '../ontology';

export const LOGICAL_MODEL_SCHEMA_VERSION = '1.0.0';

export type LogicalEntityType = 'entity' | 'abstract-entity' | 'reference-entity';

export type LogicalAttributeType = 'identifier' | 'text' | 'decimal' | 'date' | 'boolean' | 'enum' | 'reference';

export const DATATYPE_TO_LOGICAL_TYPE: Record<PropertyDatatype, LogicalAttributeType> = {
  string: 'text',
  decimal: 'decimal',
  date: 'date',
  boolean: 'boolean',
  enum: 'enum',
  reference: 'reference',
};

export interface LogicalAttribute {
  id: string;
  name: string;
  label: string;
  logicalType: LogicalAttributeType;
  required: boolean;
  cardinality: 'one' | 'many';
  allowedValues: string[] | null;
  referenceScheme?: string;
  minValue?: number;
  maxValue?: number;
  /** True for an attribute an entity gets via subClassOf inheritance rather
   * than declaring itself -- mirrors ProgramProfileProperty.inheritedByConceptIds. */
  inherited: boolean;
  declaredOnEntityId: string;
  /** The ProgramProfileProperty.id this was mapped from, or null for the one
   * synthesized Identifier attribute every entity gets. */
  sourcePropertyId: string | null;
  description: string;
}

export interface LogicalEntity {
  id: string;
  label: string;
  category: string;
  entityType: LogicalEntityType;
  definition: string;
  /** Direct parent only, and only when the parent is also in this model --
   * mirrors ConceptualSpecializationEdge/build-conceptual-model.ts. */
  supertypeId: string | null;
  attributes: LogicalAttribute[];
}

interface LogicalAssociationBase {
  id: string;
  sourceEntityId: string;
  targetEntityId: string;
  label: string;
}

export interface LogicalBusinessAssociation extends LogicalAssociationBase {
  type: 'business';
  predicate: string;
  description: string;
  /** No relationship in the ontology carries a cardinality -- always
   * 'unspecified' for now, surfaced via a LogicalModelWarning. See the file
   * header. */
  cardinality: 'unspecified';
}

export interface LogicalSpecializationAssociation extends LogicalAssociationBase {
  type: 'specialization';
  label: 'specializes';
}

export type LogicalAssociation = LogicalBusinessAssociation | LogicalSpecializationAssociation;

export type LogicalModelWarningCode = 'cardinality-unspecified' | 'abstract-entity-inferred';

export interface LogicalModelWarning {
  code: LogicalModelWarningCode;
  message: string;
  relatedIds?: string[];
}

export interface LogicalModelStats {
  entities: number;
  abstractEntities: number;
  referenceEntities: number;
  attributes: number;
  businessAssociations: number;
  specializationAssociations: number;
}

export interface LogicalModel {
  modelType: 'logical';
  logicalModelSchemaVersion: string;
  ontologyVersion: string;
  entities: LogicalEntity[];
  associations: LogicalAssociation[];
  stats: LogicalModelStats;
  warnings: LogicalModelWarning[];
}
