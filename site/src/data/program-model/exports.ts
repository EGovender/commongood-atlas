// Export builders for the Program Profile and its Conceptual Model
// projection. Pure string builders, same discipline as design-export.ts --
// kept separate from any component so the output shape can be reasoned
// about independently of rendering/state.
import { CATEGORIES } from '../categories';
import { DESIGN_SECTIONS } from '../design-questions';
import { requireConcept } from '../ontology';
import type { ConceptualModel, ProgramProfile, ProgramProfileAnswer, ProgramProfileExportEnvelope } from './types';

/** The canonical machine interface: a versioned, timestamped envelope
 * around the deterministic ProgramProfile core. Meant to remain readable by
 * a future logical/physical-model generator without needing this site's
 * source code. */
export function buildProgramProfileJson(profile: ProgramProfile): string {
  const envelope: ProgramProfileExportEnvelope = {
    generatedAt: new Date().toISOString(),
    profile,
  };
  return JSON.stringify(envelope, null, 2);
}

export function buildConceptualModelJson(model: ConceptualModel): string {
  const payload = {
    generatedBy: 'CommonGood Atlas',
    generatedAt: new Date().toISOString(),
    ...model,
  };
  return JSON.stringify(payload, null, 2);
}

/** The human-readable counterpart to the JSON exports -- useful without the
 * website, per the questionnaire's own "Download summary" precedent. */
export function buildConceptualModelMarkdown(profile: ProgramProfile): string {
  const lines: string[] = ['# CommonGood Atlas — Your Program Model', '', `Ontology version: ${profile.ontologyVersion}`, ''];

  lines.push('## Questionnaire Summary', '');
  if (profile.answers.length === 0) {
    lines.push(
      'No questions answered -- this model shows the foundation every grantmaking program needs.',
      ''
    );
  } else {
    const answersBySection = new Map<string, ProgramProfileAnswer[]>();
    for (const a of profile.answers) {
      const list = answersBySection.get(a.sectionId) ?? [];
      list.push(a);
      answersBySection.set(a.sectionId, list);
    }
    for (const section of DESIGN_SECTIONS) {
      const answers = answersBySection.get(section.id);
      if (!answers || answers.length === 0) continue;
      lines.push(`### ${section.label}`, '');
      for (const a of answers) {
        lines.push(`- ${a.question} **${a.label}**`);
      }
      lines.push('');
    }
  }

  lines.push(
    '## Model Summary',
    '',
    `- ${profile.stats.totalConcepts} concepts (${profile.stats.foundationConcepts} foundation, ${profile.stats.answerSelectedConcepts} from your answers, ${profile.stats.supportingConcepts} supporting)`,
    `- ${profile.stats.relationships} relationships`,
    `- ${profile.stats.properties} properties`,
    ''
  );

  lines.push('## Concepts', '');
  for (const category of CATEGORIES) {
    const items = profile.concepts.filter((c) => c.category === category.id);
    if (items.length === 0) continue;
    lines.push(`### ${category.label}`, '');
    for (const c of items) {
      lines.push(`#### ${c.label}`, '', c.definition, '', 'Included because:', '');
      for (const r of c.reasons) lines.push(`- ${r.explanation}`);
      lines.push('');

      const rels = profile.relationships.filter((r) => r.subject === c.id || r.object === c.id);
      if (rels.length > 0) {
        lines.push('Relationships:', '');
        for (const r of rels) {
          lines.push(
            r.subject === c.id
              ? `- ${r.label} → ${requireConcept(r.object).label}`
              : `- ← ${requireConcept(r.subject).label} ${r.label}`
          );
        }
        lines.push('');
      }
    }
  }

  if (profile.businessRules.inScope.length > 0 || profile.businessRules.related.length > 0) {
    lines.push('## Business Rules', '');
    if (profile.businessRules.inScope.length > 0) {
      lines.push('### In scope', '');
      for (const r of profile.businessRules.inScope) lines.push(`- **${r.label}** -- ${r.description}`);
      lines.push('');
    }
    if (profile.businessRules.related.length > 0) {
      lines.push('### Related', '');
      for (const r of profile.businessRules.related) lines.push(`- **${r.label}** -- ${r.description}`);
      lines.push('');
    }
  }

  return lines.join('\n');
}

function mermaidId(conceptId: string): string {
  return conceptId.replace(/-/g, '_');
}

/** Plain-text Mermaid flowchart syntax -- no Mermaid library dependency,
 * this just generates the text. Rendering it is left to whatever the
 * downloaded file is pasted into. */
export function buildConceptualModelMermaid(model: ConceptualModel): string {
  const lines: string[] = ['flowchart LR'];
  for (const node of model.nodes) {
    lines.push(`    ${mermaidId(node.id)}["${node.label}"]`);
  }
  for (const edge of model.edges) {
    const arrow = edge.type === 'specialization' ? '-.->' : '-->';
    lines.push(`    ${mermaidId(edge.source)} ${arrow}|"${edge.label}"| ${mermaidId(edge.target)}`);
  }
  return lines.join('\n') + '\n';
}
