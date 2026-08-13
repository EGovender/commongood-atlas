import { describe, it, expect } from 'vitest';
import { buildProgramProfile } from '../build-program-profile';
import { buildConceptualModel } from '../build-conceptual-model';
import {
  buildConceptualModelJson,
  buildConceptualModelMarkdown,
  buildConceptualModelMermaid,
  buildProgramProfileJson,
} from '../exports';

// A small, deterministic profile is enough to check shape -- no need for a
// full-ontology snapshot (see docs/10-program-model-generation.md's testing
// notes on avoiding enormous snapshots).
const profile = buildProgramProfile({ installments: 'yes' });
const model = buildConceptualModel(profile);

describe('buildProgramProfileJson', () => {
  it('wraps the profile in a timestamped envelope, valid JSON', () => {
    const json = buildProgramProfileJson(profile);
    const parsed = JSON.parse(json);
    expect(typeof parsed.generatedAt).toBe('string');
    expect(() => new Date(parsed.generatedAt).toISOString()).not.toThrow();
    expect(parsed.profile.profileSchemaVersion).toBe(profile.profileSchemaVersion);
    expect(parsed.profile.concepts).toHaveLength(profile.concepts.length);
  });
});

describe('buildConceptualModelJson', () => {
  it('emits generatedBy/generatedAt plus the model, valid JSON', () => {
    const json = buildConceptualModelJson(model);
    const parsed = JSON.parse(json);
    expect(parsed.generatedBy).toBe('CommonGood Atlas');
    expect(typeof parsed.generatedAt).toBe('string');
    expect(parsed.modelType).toBe('conceptual');
    expect(parsed.nodes).toHaveLength(model.nodes.length);
  });
});

describe('buildConceptualModelMarkdown', () => {
  it('includes the questionnaire summary, model summary, and concept sections', () => {
    const md = buildConceptualModelMarkdown(profile);
    expect(md).toContain('# CommonGood Atlas — Your Program Model');
    expect(md).toContain(`Ontology version: ${profile.ontologyVersion}`);
    expect(md).toContain('## Questionnaire Summary');
    expect(md).toContain('## Model Summary');
    expect(md).toContain('## Concepts');
    expect(md).toContain('#### Installment');
    expect(md).toContain('Included because:');
  });

  it('handles a no-answers profile without a questionnaire summary section list', () => {
    const emptyProfile = buildProgramProfile({});
    const md = buildConceptualModelMarkdown(emptyProfile);
    expect(md).toContain('No questions answered');
  });
});

describe('buildConceptualModelMermaid', () => {
  it('emits a flowchart with sanitized node ids and every edge', () => {
    const mmd = buildConceptualModelMermaid(model);
    expect(mmd.startsWith('flowchart LR')).toBe(true);
    // Hyphenated concept ids become underscore-safe Mermaid identifiers.
    expect(mmd).toContain('payment_schedule["Payment Schedule"]');
    expect(mmd).not.toContain('payment-schedule[');

    const edgeLines = mmd.split('\n').filter((l) => l.includes('-->') || l.includes('-.->'));
    expect(edgeLines.length).toBe(model.edges.length);
  });
});
