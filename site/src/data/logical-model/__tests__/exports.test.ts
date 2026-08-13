import { describe, it, expect } from 'vitest';
import { buildProgramProfile } from '../../program-model/build-program-profile';
import { buildLogicalModel } from '../build-logical-model';
import { buildLogicalModelJson, buildLogicalModelMarkdown, buildLogicalModelMermaid } from '../exports';

const profile = buildProgramProfile({ installments: 'yes' });
const model = buildLogicalModel(profile);

describe('buildLogicalModelJson', () => {
  it('emits generatedBy/generatedAt plus the model, valid JSON', () => {
    const json = buildLogicalModelJson(model);
    const parsed = JSON.parse(json);
    expect(parsed.generatedBy).toBe('CommonGood Atlas');
    expect(typeof parsed.generatedAt).toBe('string');
    expect(parsed.modelType).toBe('logical');
    expect(parsed.entities).toHaveLength(model.entities.length);
  });
});

describe('buildLogicalModelMarkdown', () => {
  it('includes the summary, warnings, and entity sections with attributes and associations', () => {
    const md = buildLogicalModelMarkdown(model);
    expect(md).toContain('# CommonGood Atlas — Your Logical Model');
    expect(md).toContain('## Model Summary');
    expect(md).toContain('## Warnings');
    expect(md).toContain('## Entities');
    expect(md).toContain('#### Award (entity)');
    expect(md).toContain('Attributes:');
  });
});

describe('buildLogicalModelMermaid', () => {
  it('emits a valid erDiagram block with every entity and association', () => {
    const mmd = buildLogicalModelMermaid(model);
    expect(mmd.startsWith('erDiagram\n')).toBe(true);
    expect(mmd).toContain('    award {');
    expect(mmd).toContain('        identifier id PK');

    const businessCount = model.associations.filter((a) => a.type === 'business').length;
    const specializationCount = model.associations.filter((a) => a.type === 'specialization').length;
    const businessLines = mmd.split('\n').filter((l) => l.includes('}o--o{')).length;
    const specializationLines = mmd.split('\n').filter((l) => l.includes('||--||')).length;
    expect(businessLines).toBe(businessCount);
    expect(specializationLines).toBe(specializationCount);
  });

  it('sanitizes hyphenated concept ids into valid Mermaid identifiers', () => {
    const daf = buildLogicalModel(buildProgramProfile({ 'donor-advised-fund': 'yes' }));
    const mmd = buildLogicalModelMermaid(daf);
    expect(mmd).toContain('donor_advised_fund');
    expect(mmd).not.toContain('donor-advised-fund {');
  });
});
