// The Program Profile closure engine -- the canonical, deterministic
// selection/resolution layer over the ontology (see
// docs/10-program-model-generation.md). Pure: no window/document/React, so
// it can run in a test, a future CLI, or a future server just as well as in
// the browser.
import { CORE_CONCEPTS, DESIGN_QUESTIONS, type DesignQuestion } from '../design-questions';
import {
  businessRules,
  getAncestorChain,
  getPropertiesForConcept,
  ontologyVersion,
  relationships,
  requireConcept,
} from '../ontology';
import { getReferenceScheme } from '../reference-data';
import { CATEGORIES } from '../categories';
import { getAnswerLabel, isQuestionVisible, normalizeAnswers } from './answers';
import { resolveQuestionEffect } from './effects';
import { PROGRAM_MODEL_DEPENDENCIES, type ProgramModelDependency } from './dependencies';
import {
  PROGRAM_PROFILE_SCHEMA_VERSION,
  type ConceptInclusionKind,
  type ConceptInclusionReason,
  type ProgramProfile,
  type ProgramProfileAnswer,
  type ProgramProfileBusinessRule,
  type ProgramProfileConcept,
  type ProgramProfileProperty,
  type ProgramProfileReferenceScheme,
  type ProgramProfileRelationship,
  type ProgramProfileStats,
  type ProgramProfileWarning,
} from './types';

export interface BuildProgramProfileOptions {
  questions?: DesignQuestion[];
  foundationConceptIds?: string[];
  dependencies?: ProgramModelDependency[];
}

const CATEGORY_ORDER = new Map(CATEGORIES.map((c, i) => [c.id, i]));

function sortConceptIds(ids: string[]): string[] {
  return [...ids].sort((a, b) => {
    const ca = requireConcept(a);
    const cb = requireConcept(b);
    const oa = CATEGORY_ORDER.get(ca.category) ?? Number.MAX_SAFE_INTEGER;
    const ob = CATEGORY_ORDER.get(cb.category) ?? Number.MAX_SAFE_INTEGER;
    if (oa !== ob) return oa - ob;
    return ca.label.localeCompare(cb.label);
  });
}

function uniqueKinds(reasons: ConceptInclusionReason[]): ConceptInclusionKind[] {
  const seen = new Set<ConceptInclusionKind>();
  const order: ConceptInclusionKind[] = [];
  for (const r of reasons) {
    if (!seen.has(r.kind)) {
      seen.add(r.kind);
      order.push(r.kind);
    }
  }
  return order;
}

function reasonKey(reason: ConceptInclusionReason): string {
  return [reason.kind, reason.sourceQuestionId ?? '', reason.sourceConceptId ?? '', reason.dependencyRuleId ?? ''].join(
    '|'
  );
}

// Generous relative to the ontology's actual size (~90 concepts total) --
// this exists purely as a defensive backstop against a malformed ontology
// introducing a subClassOf/dependency cycle, not a limit expected to be hit
// in normal operation. See the 'closure-cycle' warning below.
const MAX_CLOSURE_ITERATIONS = 100;

/**
 * Resolves a questionnaire answer set into a ProgramProfile: foundation +
 * answer-selected concepts, closed over subClassOf ancestors and any
 * explicit dependency rules, then projected out to the relationships,
 * properties, reference schemes, and business rules that subset actually
 * touches. Deterministic -- the same answers + ontology always produce a
 * deep-equal profile (see build-program-profile.test.ts).
 */
export function buildProgramProfile(
  rawAnswers: Record<string, string>,
  {
    questions = DESIGN_QUESTIONS,
    foundationConceptIds = CORE_CONCEPTS,
    dependencies = PROGRAM_MODEL_DEPENDENCIES,
  }: BuildProgramProfileOptions = {}
): ProgramProfile {
  const { answers, ignored } = normalizeAnswers(rawAnswers, questions);

  const conceptIds = new Set<string>(foundationConceptIds);
  const reasonsByConceptId = new Map<string, ConceptInclusionReason[]>();

  function addReason(conceptId: string, reason: ConceptInclusionReason) {
    const key = reasonKey(reason);
    const existing = reasonsByConceptId.get(conceptId) ?? [];
    if (existing.some((r) => reasonKey(r) === key)) return;
    existing.push(reason);
    reasonsByConceptId.set(conceptId, existing);
  }

  for (const id of foundationConceptIds) {
    addReason(id, { kind: 'foundation', explanation: 'Part of the CommonGood Atlas grantmaking foundation.' });
  }

  const visibleQuestions = questions.filter((q) => isQuestionVisible(q, answers));
  const answerRecords: ProgramProfileAnswer[] = [];
  for (const q of visibleQuestions) {
    const value = answers[q.id];
    if (!value) continue;
    const label = getAnswerLabel(q, value);
    answerRecords.push({ questionId: q.id, sectionId: q.section, question: q.text, value, label });

    const effect = resolveQuestionEffect(q, value);
    for (const id of effect.concepts ?? []) {
      conceptIds.add(id);
      addReason(id, {
        kind: 'answer',
        sourceQuestionId: q.id,
        sourceQuestion: q.text,
        answerValue: value,
        answerLabel: label,
        explanation: `Because you answered "${label}" to: ${q.text}`,
      });
    }
  }
  answerRecords.sort((a, b) => a.questionId.localeCompare(b.questionId));

  const directConceptIds = new Set(conceptIds);

  let hitIterationCap = false;
  let changed = true;
  let iterations = 0;
  while (changed) {
    if (++iterations > MAX_CLOSURE_ITERATIONS) {
      hitIterationCap = true;
      break;
    }
    changed = false;

    for (const id of Array.from(conceptIds)) {
      for (const ancestor of getAncestorChain(id)) {
        if (ancestor.id === id) continue;
        if (!conceptIds.has(ancestor.id)) {
          conceptIds.add(ancestor.id);
          changed = true;
        }
        addReason(ancestor.id, {
          kind: 'ancestor',
          sourceConceptId: id,
          explanation: `Included because ${requireConcept(id).label} specializes ${ancestor.label}.`,
        });
      }
    }

    for (const dep of dependencies) {
      if (!conceptIds.has(dep.whenConcept)) continue;
      for (const id of dep.includeConcepts) {
        if (!conceptIds.has(id)) {
          conceptIds.add(id);
          changed = true;
        }
        addReason(id, {
          kind: 'dependency',
          sourceConceptId: dep.whenConcept,
          dependencyRuleId: dep.id,
          explanation: dep.explanation,
        });
      }
    }
  }

  const sortedConceptIds = sortConceptIds(Array.from(conceptIds));
  const profileConceptIdSet = new Set(sortedConceptIds);

  const profileConcepts: ProgramProfileConcept[] = sortedConceptIds.map((id) => {
    const c = requireConcept(id);
    const reasons = reasonsByConceptId.get(id) ?? [];
    return {
      id: c.id,
      label: c.label,
      category: c.category,
      kind: c.kind,
      definition: c.definition,
      subClassOf: c.subClassOf,
      direct: directConceptIds.has(id),
      inclusionKinds: uniqueKinds(reasons),
      reasons,
      deprecated: c.deprecated ?? false,
    };
  });

  const profileRelationships: ProgramProfileRelationship[] = relationships
    .filter((r) => profileConceptIdSet.has(r.subject) && profileConceptIdSet.has(r.object))
    .map((r) => ({
      id: r.id,
      subject: r.subject,
      predicate: r.predicate,
      object: r.object,
      label: r.label,
      description: r.description,
      docRef: r.docRef,
    }))
    .sort(
      (a, b) =>
        a.subject.localeCompare(b.subject) ||
        a.predicate.localeCompare(b.predicate) ||
        a.object.localeCompare(b.object)
    );

  const propertyRows = new Map<string, ProgramProfileProperty>();
  for (const id of sortedConceptIds) {
    for (const p of getPropertiesForConcept(id)) {
      const existing = propertyRows.get(p.id);
      if (existing) {
        if (!existing.appliesToConceptIds.includes(id)) existing.appliesToConceptIds.push(id);
        if (p.concept !== id && !existing.inheritedByConceptIds.includes(id)) existing.inheritedByConceptIds.push(id);
      } else {
        propertyRows.set(p.id, {
          id: p.id,
          name: p.name,
          label: p.label,
          group: p.group,
          datatype: p.datatype,
          referenceScheme: p.referenceScheme,
          required: p.required,
          cardinality: p.cardinality,
          allowedValues: p.allowedValues,
          minValue: p.minValue,
          maxValue: p.maxValue,
          description: p.description,
          declaredOnConceptId: p.concept,
          appliesToConceptIds: [id],
          inheritedByConceptIds: p.concept !== id ? [id] : [],
        });
      }
    }
  }
  const profileProperties = Array.from(propertyRows.values()).sort(
    (a, b) =>
      a.declaredOnConceptId.localeCompare(b.declaredOnConceptId) ||
      a.group.localeCompare(b.group) ||
      a.label.localeCompare(b.label) ||
      a.id.localeCompare(b.id)
  );

  const usedByPropertiesByScheme = new Map<string, Set<string>>();
  for (const p of profileProperties) {
    if (p.datatype === 'reference' && p.referenceScheme) {
      const set = usedByPropertiesByScheme.get(p.referenceScheme) ?? new Set<string>();
      set.add(p.id);
      usedByPropertiesByScheme.set(p.referenceScheme, set);
    }
  }
  // getReferenceScheme() throws on an unknown id -- deliberately not
  // swallowed here. A property naming a scheme that doesn't exist is a
  // schema/authoring error (ontology/source/properties.json referencing a
  // scheme with no matching reference-data file), which should fail the
  // build, not surface as a runtime 'missing-reference-scheme' warning.
  const profileReferenceSchemes: ProgramProfileReferenceScheme[] = Array.from(usedByPropertiesByScheme.keys())
    .sort((a, b) => a.localeCompare(b))
    .map((schemeId) => {
      const scheme = getReferenceScheme(schemeId);
      return {
        id: scheme.id,
        label: scheme.label,
        description: scheme.description,
        domain: scheme.domain,
        authorityType: scheme.authorityType,
        version: scheme.version,
        usedByProperties: Array.from(usedByPropertiesByScheme.get(schemeId)!).sort(),
        values: scheme.values.map((v) => ({
          id: v.id,
          code: v.code,
          label: v.label,
          definition: v.definition,
          deprecated: v.deprecated,
        })),
      };
    });

  const inScope: ProgramProfileBusinessRule[] = [];
  const related: ProgramProfileBusinessRule[] = [];
  for (const rule of [...businessRules].sort((a, b) => a.id.localeCompare(b.id))) {
    const selected = rule.concepts.filter((id) => profileConceptIdSet.has(id));
    if (selected.length === 0) continue;
    const missing = rule.concepts.filter((id) => !profileConceptIdSet.has(id));
    const entry: ProgramProfileBusinessRule = {
      id: rule.id,
      label: rule.label,
      description: rule.description,
      conceptIds: rule.concepts,
      selectedConceptIds: selected,
      missingConceptIds: missing,
      status: missing.length === 0 ? 'in-scope' : 'related',
      docRef: rule.docRef,
    };
    (missing.length === 0 ? inScope : related).push(entry);
  }

  const foundationCount = profileConcepts.filter((c) => c.inclusionKinds.includes('foundation')).length;
  const answerSelectedCount = profileConcepts.filter(
    (c) => c.direct && !c.inclusionKinds.includes('foundation')
  ).length;
  const supportingCount = profileConcepts.filter((c) => !c.direct).length;

  const stats: ProgramProfileStats = {
    totalConcepts: profileConcepts.length,
    foundationConcepts: foundationCount,
    answerSelectedConcepts: answerSelectedCount,
    supportingConcepts: supportingCount,
    relationships: profileRelationships.length,
    properties: profileProperties.length,
    referenceSchemes: profileReferenceSchemes.length,
    businessRulesInScope: inScope.length,
    businessRulesRelated: related.length,
    answeredQuestions: answerRecords.length,
    applicableQuestions: visibleQuestions.length,
  };

  const warnings: ProgramProfileWarning[] = [];
  const deprecatedConcepts = profileConcepts.filter((c) => c.deprecated);
  if (deprecatedConcepts.length > 0) {
    warnings.push({
      code: 'deprecated-concept',
      message: `${deprecatedConcepts.length} concept${deprecatedConcepts.length === 1 ? ' is' : 's are'} deprecated: ${deprecatedConcepts
        .map((c) => c.label)
        .join(', ')}.`,
      relatedIds: deprecatedConcepts.map((c) => c.id),
    });
  }
  for (const ignoredAnswer of ignored) {
    if (ignoredAnswer.reason === 'hidden-by-dependency') {
      warnings.push({
        code: 'ignored-hidden-answer',
        message: `Ignored a stale answer to "${ignoredAnswer.questionId}" -- that question is no longer applicable given your other answers.`,
        relatedIds: [ignoredAnswer.questionId],
      });
    }
  }
  if (hitIterationCap) {
    warnings.push({
      code: 'closure-cycle',
      message:
        'Concept closure did not converge within the expected number of iterations -- check for a cycle in subClassOf or the dependency rules.',
    });
  }

  return {
    profileSchemaVersion: PROGRAM_PROFILE_SCHEMA_VERSION,
    ontologyVersion,
    answers: answerRecords,
    ignoredAnswers: [...ignored],
    concepts: profileConcepts,
    relationships: profileRelationships,
    properties: profileProperties,
    referenceSchemes: profileReferenceSchemes,
    businessRules: { inScope, related },
    stats,
    warnings,
  };
}
