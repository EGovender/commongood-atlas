// Pure projection from a ProgramProfile to its database-independent Logical
// Model: Entities/Attributes/Associations, nothing else. No tables, columns,
// SQL types, or key-storage concepts -- those belong to a future
// Implementation Profile / Physical Model layer this deliberately doesn't
// build yet. See docs/10-program-model-generation.md's "Logical Model"
// section and docs/04-roadmap.md Phase 3.12.
import { getIncomingRelationships, getOutgoingRelationships } from '../ontology';
import type { ProgramProfile, ProgramProfileConcept } from '../program-model';
import {
  DATATYPE_TO_LOGICAL_TYPE,
  LOGICAL_MODEL_SCHEMA_VERSION,
  type LogicalAssociation,
  type LogicalAttribute,
  type LogicalBusinessAssociation,
  type LogicalEntity,
  type LogicalEntityType,
  type LogicalModel,
  type LogicalModelWarning,
  type LogicalSpecializationAssociation,
} from './types';

function synthesizedIdentifier(entity: ProgramProfileConcept): LogicalAttribute {
  return {
    id: `${entity.id}.id`,
    name: 'id',
    label: 'ID',
    logicalType: 'identifier',
    required: true,
    cardinality: 'one',
    allowedValues: null,
    inherited: false,
    declaredOnEntityId: entity.id,
    sourcePropertyId: null,
    description: `Synthesized identifier -- no natural key is modeled for ${entity.label} anywhere in the ontology (see docs/10-program-model-generation.md).`,
  };
}

/**
 * A concept is classified 'abstract-entity' only when it has zero properties
 * declared on itself AND at least one subtype also present in the profile --
 * i.e. it exists purely as a property-carrying grouping for its subtypes,
 * not to hold its own instance data. This is an inferred heuristic, not an
 * ontology fact: nothing in concepts.json marks any concept as
 * non-instantiable. See docs/10-program-model-generation.md.
 */
function classifyEntityType(
  concept: ProgramProfileConcept,
  hasOwnProperty: boolean,
  hasSubtypeInProfile: boolean
): LogicalEntityType {
  if (concept.kind === 'reference-scheme' || concept.kind === 'reference-value') return 'reference-entity';
  if (!hasOwnProperty && hasSubtypeInProfile) return 'abstract-entity';
  return 'entity';
}

export function buildLogicalModel(profile: ProgramProfile): LogicalModel {
  const conceptIds = new Set(profile.concepts.map((c) => c.id));

  const conceptsWithOwnProperty = new Set(profile.properties.map((p) => p.declaredOnConceptId));
  const conceptsWithSubtypeInProfile = new Set(
    profile.concepts.filter((c) => c.subClassOf !== null).map((c) => c.subClassOf as string)
  );

  const entities: LogicalEntity[] = profile.concepts.map((c) => {
    const entityType = classifyEntityType(c, conceptsWithOwnProperty.has(c.id), conceptsWithSubtypeInProfile.has(c.id));

    const attributes: LogicalAttribute[] = [
      synthesizedIdentifier(c),
      ...profile.properties
        .filter((p) => p.appliesToConceptIds.includes(c.id))
        .map((p) => ({
          id: `${c.id}.${p.name}`,
          name: p.name,
          label: p.label,
          logicalType: DATATYPE_TO_LOGICAL_TYPE[p.datatype],
          required: p.required,
          cardinality: p.cardinality,
          allowedValues: p.allowedValues,
          referenceScheme: p.referenceScheme,
          minValue: p.minValue,
          maxValue: p.maxValue,
          inherited: p.inheritedByConceptIds.includes(c.id),
          declaredOnEntityId: p.declaredOnConceptId,
          sourcePropertyId: p.id,
          description: p.description,
        })),
    ];

    return {
      id: c.id,
      label: c.label,
      category: c.category,
      entityType,
      definition: c.definition,
      supertypeId: c.subClassOf !== null && conceptIds.has(c.subClassOf) ? c.subClassOf : null,
      attributes,
    };
  });

  // Business associations: the profile's own literal relationships, plus --
  // mirroring the same scoping GraphExplorer.tsx already ships for the graph
  // view -- one substituted association per zero-own-relationship entity,
  // resolved via ontology.ts's ancestor-chain-aware relationship lookups, so
  // an entity like Use Restriction (zero relationships of its own, but real
  // ones via its Grant Term ancestor) isn't left association-less here too.
  const literalAssociations: LogicalBusinessAssociation[] = profile.relationships.map((r) => ({
    type: 'business',
    id: r.id,
    sourceEntityId: r.subject,
    targetEntityId: r.object,
    predicate: r.predicate,
    label: r.label,
    description: r.description,
    cardinality: 'unspecified',
  }));

  const conceptIdsWithOwnRelationship = new Set<string>();
  for (const r of profile.relationships) {
    conceptIdsWithOwnRelationship.add(r.subject);
    conceptIdsWithOwnRelationship.add(r.object);
  }

  const inheritedAssociations: LogicalBusinessAssociation[] = [];
  for (const c of profile.concepts) {
    if (conceptIdsWithOwnRelationship.has(c.id)) continue;
    for (const { relationship } of getOutgoingRelationships(c.id)) {
      if (!conceptIds.has(relationship.object)) continue;
      inheritedAssociations.push({
        type: 'business',
        id: `inherited:${c.id}:${relationship.id}`,
        sourceEntityId: c.id,
        targetEntityId: relationship.object,
        predicate: relationship.predicate,
        label: relationship.label,
        description: relationship.description,
        cardinality: 'unspecified',
      });
    }
    for (const { relationship } of getIncomingRelationships(c.id)) {
      if (!conceptIds.has(relationship.subject)) continue;
      inheritedAssociations.push({
        type: 'business',
        id: `inherited:${c.id}:${relationship.id}`,
        sourceEntityId: relationship.subject,
        targetEntityId: c.id,
        predicate: relationship.predicate,
        label: relationship.label,
        description: relationship.description,
        cardinality: 'unspecified',
      });
    }
  }

  const businessAssociations = [...literalAssociations, ...inheritedAssociations];

  // Emitted only where the supertype is also in-profile -- guaranteed by the
  // Program Profile's own ancestor closure. Mirrors build-conceptual-model.ts's
  // specialization-edge construction exactly.
  const specializationAssociations: LogicalSpecializationAssociation[] = profile.concepts
    .filter((c) => c.subClassOf !== null && conceptIds.has(c.subClassOf))
    .map((c) => ({
      type: 'specialization',
      id: `specializes:${c.id}`,
      sourceEntityId: c.id,
      targetEntityId: c.subClassOf as string,
      label: 'specializes',
    }));

  const associations: LogicalAssociation[] = [...businessAssociations, ...specializationAssociations];

  const warnings: LogicalModelWarning[] = [];
  if (businessAssociations.length > 0) {
    warnings.push({
      code: 'cardinality-unspecified',
      message: `${businessAssociations.length} business association${businessAssociations.length === 1 ? ' has' : 's have'} unspecified cardinality -- relationships.json doesn't encode 1:1/1:N/N:M anywhere yet, so none is inferred here. Treat as informational only until a future ontology proposal adds a real cardinality field.`,
      relatedIds: businessAssociations.map((a) => a.id),
    });
  }
  const abstractEntities = entities.filter((e) => e.entityType === 'abstract-entity');
  if (abstractEntities.length > 0) {
    warnings.push({
      code: 'abstract-entity-inferred',
      message: `${abstractEntities.length} entit${abstractEntities.length === 1 ? 'y' : 'ies'} classified as Abstract Entity by inference (no ontology field marks a concept non-instantiable -- see docs/10-program-model-generation.md): ${abstractEntities.map((e) => e.label).join(', ')}.`,
      relatedIds: abstractEntities.map((e) => e.id),
    });
  }

  return {
    modelType: 'logical',
    logicalModelSchemaVersion: LOGICAL_MODEL_SCHEMA_VERSION,
    ontologyVersion: profile.ontologyVersion,
    entities,
    associations,
    stats: {
      entities: entities.length,
      abstractEntities: abstractEntities.length,
      referenceEntities: entities.filter((e) => e.entityType === 'reference-entity').length,
      attributes: entities.reduce((sum, e) => sum + e.attributes.length, 0),
      businessAssociations: businessAssociations.length,
      specializationAssociations: specializationAssociations.length,
    },
    warnings,
  };
}
