import { getCategory } from '../../data/categories';
import type { ConceptInclusionKind, ConceptualModel, ProgramProfile } from '../../data/program-model';

interface Props {
  profile: ProgramProfile;
  model: ConceptualModel;
  selectedId: string | null;
  base: string;
}

const INCLUSION_LABELS: Record<ConceptInclusionKind, string> = {
  foundation: 'Foundation',
  answer: 'Added from your answers',
  ancestor: 'Supporting structure',
  dependency: 'Supporting structure',
};

const REASON_GROUP_ORDER: ConceptInclusionKind[] = ['foundation', 'answer', 'ancestor', 'dependency'];

/**
 * The selected concept's detail panel. `aria-live="polite"` on the whole
 * panel is the selection announcement a keyboard user needs when they
 * activate a diagram node with Enter/Space (see docs/10-program-model-
 * generation.md and ConceptualModelDiagram.tsx) -- the panel's entire new
 * content is what a screen reader should read out, not a separate hidden
 * status string duplicating it.
 */
export default function ConceptualModelInspector({ profile, model, selectedId, base }: Props) {
  if (!selectedId) return null;

  const concept = profile.concepts.find((c) => c.id === selectedId);
  if (!concept) return null;

  const nodesById = new Map(model.nodes.map((n) => [n.id, n]));
  const relationshipEdges = model.edges.filter(
    (e) => e.type === 'relationship' && (e.source === selectedId || e.target === selectedId)
  );
  const outgoing = relationshipEdges.filter((e) => e.source === selectedId);
  const incoming = relationshipEdges.filter((e) => e.target === selectedId);
  const specializes = model.edges.filter((e) => e.type === 'specialization' && e.source === selectedId);
  const specializedBy = model.edges.filter((e) => e.type === 'specialization' && e.target === selectedId);
  const hasRelationships = specializes.length + specializedBy.length + outgoing.length + incoming.length > 0;

  const properties = profile.properties.filter((p) => p.appliesToConceptIds.includes(selectedId));
  const inScopeRules = profile.businessRules.inScope.filter((r) => r.conceptIds.includes(selectedId));
  const relatedRules = profile.businessRules.related.filter((r) => r.conceptIds.includes(selectedId));

  const category = getCategory(concept.category);

  return (
    <div className="conceptual-model-inspector" aria-live="polite">
      <h2 className="inspector-group-title conceptual-model-inspector-title">
        <span
          className="search-result-swatch"
          style={{ background: `light-dark(${category.colorLight}, ${category.colorDark})`, marginTop: 0 }}
        />
        {concept.label}
      </h2>
      <p className="muted conceptual-model-inspector-meta">
        {category.label}
        {concept.deprecated ? ' · Deprecated' : ''}
      </p>
      <p>{concept.definition}</p>

      <h3 className="inspector-group-title">Why this is in your model</h3>
      {REASON_GROUP_ORDER.map((kind) => {
        const reasons = concept.reasons.filter((r) => r.kind === kind);
        if (reasons.length === 0) return null;
        return (
          <div key={kind} className="conceptual-model-inspector-reason-group">
            <p className="conceptual-model-inspector-reason-label">{INCLUSION_LABELS[kind]}</p>
            <ul>
              {reasons.map((r, i) => (
                <li key={i}>{r.explanation}</li>
              ))}
            </ul>
          </div>
        );
      })}

      {hasRelationships && (
        <>
          <h3 className="inspector-group-title">Relationships in your model</h3>
          <ul className="conceptual-model-inspector-relationships">
            {specializes.map((e) => (
              <li key={e.id} className="muted">
                specializes {nodesById.get(e.target)?.label ?? e.target}
              </li>
            ))}
            {specializedBy.map((e) => (
              <li key={e.id} className="muted">
                specialized by {nodesById.get(e.source)?.label ?? e.source}
              </li>
            ))}
            {outgoing.map((e) => (
              <li key={e.id}>
                {e.label} &rarr; {nodesById.get(e.target)?.label ?? e.target}
              </li>
            ))}
            {incoming.map((e) => (
              <li key={e.id}>
                &larr; {nodesById.get(e.source)?.label ?? e.source} {e.label}
              </li>
            ))}
          </ul>
        </>
      )}

      <h3 className="inspector-group-title">Properties</h3>
      <p className="muted">
        {properties.length} tracked attribute{properties.length === 1 ? '' : 's'}
      </p>
      {properties.length > 0 && (
        <details className="conceptual-model-inspector-details">
          <summary className="muted">Show properties</summary>
          <ul>
            {properties.map((p) => (
              <li key={p.id}>
                {p.label}
                {p.required ? ' (required)' : ''}
              </li>
            ))}
          </ul>
        </details>
      )}

      {(inScopeRules.length > 0 || relatedRules.length > 0) && (
        <>
          <h3 className="inspector-group-title">Business rules</h3>
          {inScopeRules.length > 0 && (
            <div>
              <p className="conceptual-model-inspector-reason-label">In scope</p>
              <ul>
                {inScopeRules.map((r) => (
                  <li key={r.id}>{r.label}</li>
                ))}
              </ul>
            </div>
          )}
          {relatedRules.length > 0 && (
            <div>
              <p className="conceptual-model-inspector-reason-label">Related</p>
              <ul>
                {relatedRules.map((r) => (
                  <li key={r.id} className="muted">
                    {r.label}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      <a className="home-cta conceptual-model-inspector-link" href={`${base}concepts/${concept.id}`}>
        View full concept &rarr;
      </a>
    </div>
  );
}
