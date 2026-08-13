import { describe, it, expect } from 'vitest';
import { buildProgramProfile } from '../../program-model/build-program-profile';
import { buildLogicalModel } from '../build-logical-model';

describe('buildLogicalModel', () => {
  it('creates one entity per profile concept, each with a synthesized identifier attribute', () => {
    const profile = buildProgramProfile({});
    const model = buildLogicalModel(profile);

    expect(model.modelType).toBe('logical');
    expect(model.ontologyVersion).toBe(profile.ontologyVersion);
    expect(model.entities).toHaveLength(profile.concepts.length);
    expect(model.stats.entities).toBe(profile.concepts.length);

    const award = model.entities.find((e) => e.id === 'award')!;
    const idAttr = award.attributes.find((a) => a.logicalType === 'identifier')!;
    expect(idAttr).toMatchObject({ name: 'id', required: true, sourcePropertyId: null });
  });

  it('maps every profile property onto the entities it applies to', () => {
    const profile = buildProgramProfile({});
    const model = buildLogicalModel(profile);
    const award = model.entities.find((e) => e.id === 'award')!;

    const amountProp = profile.properties.find((p) => p.id === 'award-amount')!;
    const amountAttr = award.attributes.find((a) => a.sourcePropertyId === 'award-amount')!;
    expect(amountAttr).toMatchObject({ logicalType: 'decimal', required: amountProp.required, inherited: false });
  });

  it('classifies a reference-scheme/reference-value concept as reference-entity', () => {
    const profile = buildProgramProfile({});
    const model = buildLogicalModel(profile);
    const referenceEntities = model.entities.filter((e) => e.entityType === 'reference-entity');
    expect(referenceEntities.length).toBe(model.stats.referenceEntities);
    for (const e of referenceEntities) {
      const concept = profile.concepts.find((c) => c.id === e.id)!;
      expect(['reference-scheme', 'reference-value']).toContain(concept.kind);
    }
  });

  it('classifies a childless-property concept with in-profile subtypes as abstract-entity', () => {
    // organization-role has no properties of its own, but its subtypes
    // (funder, grantee, ...) do; both are in the default foundation profile.
    const profile = buildProgramProfile({});
    const model = buildLogicalModel(profile);
    const organizationRole = model.entities.find((e) => e.id === 'organization-role')!;
    expect(organizationRole.entityType).toBe('abstract-entity');
    expect(
      model.warnings.some((w) => w.code === 'abstract-entity-inferred' && w.relatedIds?.includes('organization-role'))
    ).toBe(true);
  });

  it('resolves an inherited business association for an entity with zero relationships of its own', () => {
    const profile = buildProgramProfile({ 'use-restrictions': 'yes' });
    const model = buildLogicalModel(profile);

    // use-restriction has no literal relationships in relationships.json,
    // but inherits grant-term's grantTermAppliesToAward via subClassOf.
    const ownRelationship = profile.relationships.find((r) => r.subject === 'use-restriction' || r.object === 'use-restriction');
    expect(ownRelationship).toBeUndefined();

    const inherited = model.associations.find(
      (a) => a.type === 'business' && a.sourceEntityId === 'use-restriction' && a.targetEntityId === 'award'
    );
    expect(inherited).toBeDefined();
    expect(inherited).toMatchObject({ predicate: 'grantTermAppliesToAward', cardinality: 'unspecified' });
  });

  it('creates a specialization association (subtype -> supertype) for every in-profile subClassOf pair', () => {
    const profile = buildProgramProfile({ 'donor-advised-fund': 'yes' });
    const model = buildLogicalModel(profile);
    const specializations = model.associations.filter((a) => a.type === 'specialization');
    expect(model.stats.specializationAssociations).toBe(specializations.length);

    const daf = specializations.find((a) => a.sourceEntityId === 'donor-advised-fund');
    expect(daf).toMatchObject({ targetEntityId: 'fund', label: 'specializes' });
  });

  it('warns that business association cardinality is unspecified whenever any exist', () => {
    const profile = buildProgramProfile({});
    const model = buildLogicalModel(profile);
    expect(model.stats.businessAssociations).toBeGreaterThan(0);
    const warning = model.warnings.find((w) => w.code === 'cardinality-unspecified');
    expect(warning).toBeDefined();
    expect(warning?.relatedIds).toHaveLength(model.stats.businessAssociations);
  });

  it('is deterministic', () => {
    const profile = buildProgramProfile({ review: 'yes', installments: 'yes', matching: 'yes' });
    const a = buildLogicalModel(profile);
    const b = buildLogicalModel(profile);
    expect(a).toEqual(b);
  });
});
