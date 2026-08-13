import { describe, it, expect } from 'vitest';
import { buildProgramProfile } from '../build-program-profile';

describe('buildProgramProfile: no answers', () => {
  const profile = buildProgramProfile({});

  it('includes only foundation concepts plus their ancestor closure', () => {
    // The 19 CORE_CONCEPTS are not themselves ancestor-closed -- organization
    // needs agent, organization-role/funder/grantee need role,
    // program-officer/grant-administrator need person-role+role. Confirmed
    // against ontology/source/concepts.json directly (see plan research).
    expect(profile.stats.totalConcepts).toBe(22);
    expect(profile.stats.foundationConcepts).toBe(19);
    expect(profile.stats.answerSelectedConcepts).toBe(0);
    expect(profile.stats.supportingConcepts).toBe(3);

    const ids = profile.concepts.map((c) => c.id);
    expect(ids).toEqual(expect.arrayContaining(['agent', 'role', 'person-role']));

    const role = profile.concepts.find((c) => c.id === 'role')!;
    expect(role.direct).toBe(false);
    expect(role.inclusionKinds).toEqual(['ancestor']);
    expect(role.reasons.some((r) => r.kind === 'ancestor')).toBe(true);
  });

  it('has no answer-selected concepts and no answers recorded', () => {
    expect(profile.answers).toEqual([]);
    expect(profile.concepts.every((c) => !c.inclusionKinds.includes('answer'))).toBe(true);
  });

  it('is a structurally valid profile (schema/ontology version present)', () => {
    expect(profile.profileSchemaVersion).toBeTruthy();
    expect(profile.ontologyVersion).toBeTruthy();
  });
});

describe('buildProgramProfile: simple answer', () => {
  it('includes the concepts a "yes" answer selects, with a traceable reason', () => {
    const profile = buildProgramProfile({ installments: 'yes' });
    const ids = profile.concepts.map((c) => c.id);
    expect(ids).toEqual(expect.arrayContaining(['payment-schedule', 'installment']));

    const installment = profile.concepts.find((c) => c.id === 'installment')!;
    expect(installment.direct).toBe(true);
    expect(installment.inclusionKinds).toEqual(['answer']);
    expect(installment.reasons).toHaveLength(1);
    expect(installment.reasons[0]).toMatchObject({
      kind: 'answer',
      sourceQuestionId: 'installments',
      answerValue: 'yes',
      answerLabel: 'Yes',
    });
  });
});

describe('buildProgramProfile: "no" answer', () => {
  it('does not add the "yes" concepts', () => {
    const profile = buildProgramProfile({ installments: 'no' });
    const ids = profile.concepts.map((c) => c.id);
    expect(ids).not.toContain('payment-schedule');
    expect(ids).not.toContain('installment');
  });
});

describe('buildProgramProfile: conditional answer', () => {
  it('includes a visible follow-up question’s concepts when answered', () => {
    const profile = buildProgramProfile({ review: 'yes', 'site-visit': 'yes' });
    const ids = profile.concepts.map((c) => c.id);
    expect(ids).toEqual(expect.arrayContaining(['review', 'review-criteria', 'reviewer', 'site-visit']));
    expect(profile.answers.map((a) => a.questionId)).toEqual(expect.arrayContaining(['review', 'site-visit']));
  });
});

describe('buildProgramProfile: hidden stale answer', () => {
  it('ignores an answer whose question is no longer visible, and warns', () => {
    const profile = buildProgramProfile({ review: 'no', 'site-visit': 'yes' });
    const ids = profile.concepts.map((c) => c.id);
    expect(ids).not.toContain('site-visit');

    expect(profile.ignoredAnswers).toContainEqual({
      questionId: 'site-visit',
      value: 'yes',
      reason: 'hidden-by-dependency',
    });
    expect(profile.warnings.some((w) => w.code === 'ignored-hidden-answer')).toBe(true);
  });
});

describe('buildProgramProfile: multiple reasons for the same concept', () => {
  it('preserves every reason instead of first-cause-wins', () => {
    const profile = buildProgramProfile({ 'uses-funds': 'yes', 'funding-restriction': 'varies' });
    const fund = profile.concepts.find((c) => c.id === 'fund')!;
    expect(fund.direct).toBe(true);
    expect(fund.reasons).toHaveLength(2);
    const questionIds = fund.reasons.map((r) => r.sourceQuestionId).sort();
    expect(questionIds).toEqual(['funding-restriction', 'uses-funds']);
  });
});

describe('buildProgramProfile: ancestor closure fixes real orphan-parent cases', () => {
  it('donor-advised-fund pulls in its parent, fund, even when uses-funds is unanswered', () => {
    const profile = buildProgramProfile({ 'donor-advised-fund': 'yes' });
    const ids = profile.concepts.map((c) => c.id);
    expect(ids).toContain('donor-advised-fund');
    expect(ids).toContain('fund');

    const fund = profile.concepts.find((c) => c.id === 'fund')!;
    expect(fund.direct).toBe(false);
    expect(fund.reasons).toContainEqual(
      expect.objectContaining({ kind: 'ancestor', sourceConceptId: 'donor-advised-fund' })
    );
  });

  it('matching-requirement pulls in grant-condition and grant-term', () => {
    const profile = buildProgramProfile({ matching: 'yes' });
    const ids = profile.concepts.map((c) => c.id);
    expect(ids).toEqual(expect.arrayContaining(['matching-requirement', 'grant-condition', 'grant-term']));
  });

  it('approval-requirement pulls in grant-term', () => {
    const profile = buildProgramProfile({ 'approval-requirements': 'yes' });
    const ids = profile.concepts.map((c) => c.id);
    expect(ids).toEqual(expect.arrayContaining(['approval-requirement', 'grant-term']));
  });

  it('does not infinite-loop or emit a closure-cycle warning on real data', () => {
    const profile = buildProgramProfile({ matching: 'yes', 'approval-requirements': 'yes', 'donor-advised-fund': 'yes' });
    expect(profile.warnings.some((w) => w.code === 'closure-cycle')).toBe(false);
  });
});

describe('buildProgramProfile: explicit dependency mechanism', () => {
  it('applies an injected dependency rule and gives it a dependency reason', () => {
    const profile = buildProgramProfile(
      {},
      {
        dependencies: [
          {
            id: 'test-dependency',
            whenConcept: 'award',
            includeConcepts: ['report'],
            explanation: 'test-only dependency',
          },
        ],
      }
    );
    const report = profile.concepts.find((c) => c.id === 'report')!;
    expect(report).toBeDefined();
    expect(report.reasons).toContainEqual(
      expect.objectContaining({ kind: 'dependency', dependencyRuleId: 'test-dependency', sourceConceptId: 'award' })
    );
  });
});

describe('buildProgramProfile: relationships', () => {
  it('includes only relationships whose subject and object are both in the profile', () => {
    const profile = buildProgramProfile({});
    for (const r of profile.relationships) {
      const ids = profile.concepts.map((c) => c.id);
      expect(ids).toContain(r.subject);
      expect(ids).toContain(r.object);
    }
    // award --formalizedByGrantAgreement--> grant-agreement: both foundation concepts.
    expect(profile.relationships.some((r) => r.predicate === 'formalizedByGrantAgreement')).toBe(true);
    // Nothing touching `need` should appear -- need isn't in the no-answer profile.
    expect(profile.relationships.some((r) => r.subject === 'need' || r.object === 'need')).toBe(false);
  });
});

describe('buildProgramProfile: properties', () => {
  it('resolves an inherited property onto every applying selected concept', () => {
    const profile = buildProgramProfile({});
    const roleStatus = profile.properties.find((p) => p.declaredOnConceptId === 'role' && p.name === 'status');
    expect(roleStatus).toBeDefined();
    expect(roleStatus!.appliesToConceptIds).toEqual(expect.arrayContaining(['role', 'funder', 'grantee']));
    expect(roleStatus!.inheritedByConceptIds).toEqual(expect.arrayContaining(['funder', 'grantee']));
    expect(roleStatus!.inheritedByConceptIds).not.toContain('role');
  });
});

describe('buildProgramProfile: reference schemes', () => {
  it('includes the scheme backing a resolved reference-typed property', () => {
    const profile = buildProgramProfile({});
    const roleStatusScheme = profile.referenceSchemes.find((s) => s.id === 'role-status');
    expect(roleStatusScheme).toBeDefined();
    expect(roleStatusScheme!.values.length).toBeGreaterThan(0);
    expect(roleStatusScheme!.usedByProperties.length).toBeGreaterThan(0);
  });
});

describe('buildProgramProfile: business rule scope', () => {
  it('classifies a rule as in-scope when every named concept is selected', () => {
    const profile = buildProgramProfile({});
    const rule = profile.businessRules.inScope.find((r) => r.id === 'rule-award-requires-approved-decision');
    expect(rule).toBeDefined();
    expect(rule!.missingConceptIds).toEqual([]);
  });

  it('classifies a rule as related when only some named concepts are selected', () => {
    const profile = buildProgramProfile({ installments: 'yes' });
    const rule = profile.businessRules.related.find((r) => r.id === 'rule-installment-condition-before-payment');
    expect(rule).toBeDefined();
    expect(rule!.selectedConceptIds).toEqual(expect.arrayContaining(['installment', 'payment']));
    expect(rule!.missingConceptIds).toContain('payment-condition');
  });
});

describe('buildProgramProfile: deprecated-concept warning', () => {
  it('warns when a deprecated concept ends up in the profile', () => {
    const profile = buildProgramProfile({}, { foundationConceptIds: ['restricted-funding'] });
    const restrictedFunding = profile.concepts.find((c) => c.id === 'restricted-funding')!;
    expect(restrictedFunding.deprecated).toBe(true);
    expect(profile.warnings).toContainEqual(
      expect.objectContaining({ code: 'deprecated-concept', relatedIds: ['restricted-funding'] })
    );
  });
});

describe('buildProgramProfile: determinism', () => {
  it('produces a deep-equal profile for the same inputs across two calls', () => {
    const answers = { review: 'yes', 'site-visit': 'yes', installments: 'yes', matching: 'yes' };
    const a = buildProgramProfile(answers);
    const b = buildProgramProfile(answers);
    expect(a).toEqual(b);
  });
});
