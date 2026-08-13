// Export builders for the Logical Model. Pure string builders, same
// discipline as program-model/exports.ts and design-export.ts -- kept
// separate from any component so output shape can be reasoned about
// independently of rendering/state.
import { CATEGORIES } from '../categories';
import type { LogicalAttribute, LogicalModel } from './types';

export function buildLogicalModelJson(model: LogicalModel): string {
  const payload = {
    generatedBy: 'CommonGood Atlas',
    generatedAt: new Date().toISOString(),
    ...model,
  };
  return JSON.stringify(payload, null, 2);
}

function attributeLine(a: LogicalAttribute): string {
  const flags = [a.logicalType === 'identifier' ? '(PK)' : null, a.required ? 'required' : null, a.inherited ? 'inherited' : null]
    .filter(Boolean)
    .join(', ');
  return `- ${a.label} (${a.logicalType}${a.cardinality === 'many' ? ', many' : ''})${flags ? ` -- ${flags}` : ''}`;
}

/** The human-readable counterpart to the JSON export -- same structure as
 * buildConceptualModelMarkdown, one section per category, entities grouped
 * within it. */
export function buildLogicalModelMarkdown(model: LogicalModel): string {
  const lines: string[] = [
    '# CommonGood Atlas — Your Logical Model',
    '',
    `Ontology version: ${model.ontologyVersion}`,
    '',
    '## Model Summary',
    '',
    `- ${model.stats.entities} entities (${model.stats.abstractEntities} abstract, ${model.stats.referenceEntities} reference)`,
    `- ${model.stats.attributes} attributes`,
    `- ${model.stats.businessAssociations} business associations, ${model.stats.specializationAssociations} specializations`,
    '',
  ];

  if (model.warnings.length > 0) {
    lines.push('## Warnings', '');
    for (const w of model.warnings) lines.push(`- ${w.message}`);
    lines.push('');
  }

  const entitiesById = new Map(model.entities.map((e) => [e.id, e]));

  lines.push('## Entities', '');
  for (const category of CATEGORIES) {
    const items = model.entities.filter((e) => e.category === category.id);
    if (items.length === 0) continue;
    lines.push(`### ${category.label}`, '');
    for (const e of items) {
      lines.push(`#### ${e.label} (${e.entityType})`, '', e.definition, '');
      if (e.supertypeId) lines.push(`Supertype: ${entitiesById.get(e.supertypeId)?.label ?? e.supertypeId}`, '');

      lines.push('Attributes:', '');
      for (const a of e.attributes) lines.push(attributeLine(a));
      lines.push('');

      const associations = model.associations.filter((a) => a.sourceEntityId === e.id || a.targetEntityId === e.id);
      if (associations.length > 0) {
        lines.push('Associations:', '');
        for (const a of associations) {
          const other = a.sourceEntityId === e.id ? a.targetEntityId : a.sourceEntityId;
          const otherLabel = entitiesById.get(other)?.label ?? other;
          lines.push(a.sourceEntityId === e.id ? `- ${a.label} → ${otherLabel}` : `- ← ${otherLabel} ${a.label}`);
        }
        lines.push('');
      }
    }
  }

  return lines.join('\n');
}

function mermaidId(id: string): string {
  return id.replace(/-/g, '_');
}

/** Mermaid attribute "type" tokens are single words -- logicalType already
 * is one, so it's used directly (this is a logical, not physical, model:
 * these aren't SQL types, just the same labels the UI shows). */
function mermaidAttributeLine(a: LogicalAttribute): string {
  const key = a.logicalType === 'identifier' ? ' PK' : '';
  return `        ${a.logicalType} ${a.name}${key}`;
}

/**
 * A real Mermaid erDiagram block -- renders as an actual ER diagram in any
 * Mermaid-aware viewer (GitHub, the Mermaid Live Editor, etc.), without this
 * site needing to ship a custom SVG/D3 ER renderer itself (see
 * docs/10-program-model-generation.md's Logical Model section for why v1
 * ships this instead of an in-browser diagram). Business associations use
 * `}o--o{` (zero-or-many both sides) since cardinality is 'unspecified' --
 * the closest neutral rendering, not a guess at the real cardinality.
 * Specialization has no native erDiagram notation, so it's rendered as a
 * plain one-to-one line labeled "is a".
 */
export function buildLogicalModelMermaid(model: LogicalModel): string {
  const lines: string[] = ['erDiagram'];

  for (const e of model.entities) {
    lines.push(`    ${mermaidId(e.id)} {`);
    for (const a of e.attributes) lines.push(mermaidAttributeLine(a));
    lines.push('    }');
  }

  for (const a of model.associations) {
    const cardinality = a.type === 'specialization' ? '||--||' : '}o--o{';
    lines.push(`    ${mermaidId(a.sourceEntityId)} ${cardinality} ${mermaidId(a.targetEntityId)} : "${a.label}"`);
  }

  return lines.join('\n') + '\n';
}
