import { describe, it, expect } from 'vitest';
import { buildProgramProfile } from '../build-program-profile';
import { buildConceptualModel } from '../build-conceptual-model';

describe('buildConceptualModel', () => {
  it('creates one node per profile concept, with computed counts', () => {
    const profile = buildProgramProfile({});
    const model = buildConceptualModel(profile);

    expect(model.modelType).toBe('conceptual');
    expect(model.ontologyVersion).toBe(profile.ontologyVersion);
    expect(model.nodes).toHaveLength(profile.concepts.length);
    expect(model.stats.nodes).toBe(profile.concepts.length);

    const award = model.nodes.find((n) => n.id === 'award')!;
    expect(award.relationshipCount).toBe(
      profile.relationships.filter((r) => r.subject === 'award' || r.object === 'award').length
    );
    expect(award.relationshipCount).toBeGreaterThan(0);
  });

  it('creates a relationship edge for every profile relationship', () => {
    const profile = buildProgramProfile({});
    const model = buildConceptualModel(profile);
    const relationshipEdges = model.edges.filter((e) => e.type === 'relationship');
    expect(relationshipEdges).toHaveLength(profile.relationships.length);
    expect(model.stats.relationships).toBe(profile.relationships.length);

    const formalized = relationshipEdges.find((e) => e.type === 'relationship' && e.predicate === 'formalizedByGrantAgreement');
    expect(formalized).toMatchObject({ source: 'award', target: 'grant-agreement' });
  });

  it('creates a specialization edge (subtype -> parent) for every in-profile subClassOf pair', () => {
    const profile = buildProgramProfile({ 'donor-advised-fund': 'yes' });
    const model = buildConceptualModel(profile);
    const specializationEdges = model.edges.filter((e) => e.type === 'specialization');
    expect(model.stats.specializations).toBe(specializationEdges.length);

    const daf = specializationEdges.find((e) => e.source === 'donor-advised-fund');
    expect(daf).toMatchObject({ target: 'fund', label: 'specializes' });

    // Every specialization edge's parent must itself be a profile node --
    // never a dangling reference to a concept the profile doesn't include.
    const nodeIds = new Set(model.nodes.map((n) => n.id));
    for (const e of specializationEdges) {
      expect(nodeIds.has(e.source)).toBe(true);
      expect(nodeIds.has(e.target)).toBe(true);
    }
  });

  it('is deterministic', () => {
    const profile = buildProgramProfile({ review: 'yes', installments: 'yes', matching: 'yes' });
    const a = buildConceptualModel(profile);
    const b = buildConceptualModel(profile);
    expect(a).toEqual(b);
  });
});
