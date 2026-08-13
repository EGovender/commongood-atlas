// Pure projection from a ProgramProfile to its business-level Conceptual
// Model: concepts + relationships + specialization, nothing else. No
// diagram coordinates, no UI state, no database/implementation concepts --
// see docs/10-program-model-generation.md for the logical/physical layers
// this deliberately doesn't build yet.
import type {
  ConceptualModel,
  ConceptualModelEdge,
  ConceptualRelationshipEdge,
  ConceptualSpecializationEdge,
  ProgramProfile,
} from './types';

export function buildConceptualModel(profile: ProgramProfile): ConceptualModel {
  const conceptIds = new Set(profile.concepts.map((c) => c.id));

  const nodes = profile.concepts.map((c) => ({
    id: c.id,
    label: c.label,
    category: c.category,
    kind: c.kind,
    definition: c.definition,
    direct: c.direct,
    inclusionKinds: c.inclusionKinds,
    reasons: c.reasons,
    propertyCount: profile.properties.filter((p) => p.appliesToConceptIds.includes(c.id)).length,
    relationshipCount: profile.relationships.filter((r) => r.subject === c.id || r.object === c.id).length,
    deprecated: c.deprecated,
  }));

  const relationshipEdges: ConceptualRelationshipEdge[] = profile.relationships.map((r) => ({
    type: 'relationship',
    id: r.id,
    source: r.subject,
    target: r.object,
    predicate: r.predicate,
    label: r.label,
    description: r.description,
  }));

  // Emitted only where the parent is also in-profile -- guaranteed by the
  // Program Profile's own ancestor closure, so this never needs to fall back
  // to "parent not found."
  const specializationEdges: ConceptualSpecializationEdge[] = profile.concepts
    .filter((c) => c.subClassOf !== null && conceptIds.has(c.subClassOf))
    .map((c) => ({
      type: 'specialization',
      id: `specializes:${c.id}`,
      // source = subtype, target = parent (see docs/10-program-model-generation.md).
      source: c.id,
      target: c.subClassOf as string,
      label: 'specializes',
    }));

  const edges: ConceptualModelEdge[] = [...relationshipEdges, ...specializationEdges];

  return {
    modelType: 'conceptual',
    ontologyVersion: profile.ontologyVersion,
    nodes,
    edges,
    stats: {
      nodes: nodes.length,
      relationships: relationshipEdges.length,
      specializations: specializationEdges.length,
    },
  };
}
