import { CATEGORIES } from '../../data/categories';
import type { ConceptualModel } from '../../data/program-model';

interface Props {
  model: ConceptualModel;
  base: string;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

function inclusionBadge(node: ConceptualModel['nodes'][number]): string {
  if (node.inclusionKinds.includes('foundation')) return 'Foundation';
  return node.direct ? 'Added from your answers' : 'Supporting structure';
}

/**
 * The accessible, non-SVG alternative to the diagram -- must work fully on
 * its own, not just as a diagram fallback (see docs/10-program-model-
 * generation.md). Grouped by category, each concept showing why it's
 * included and every relationship it participates in, textually.
 */
export default function ConceptualModelList({ model, base, selectedId, onSelect }: Props) {
  const nodesById = new Map(model.nodes.map((n) => [n.id, n]));
  const relationshipEdges = model.edges.filter((e) => e.type === 'relationship');
  const specializationEdges = model.edges.filter((e) => e.type === 'specialization');

  return (
    <div className="conceptual-model-list">
      {CATEGORIES.map((category) => {
        const items = model.nodes.filter((n) => n.category === category.id);
        if (items.length === 0) return null;
        return (
          <section key={category.id} className="conceptual-model-list-category">
            <h3 className="inspector-group-title conceptual-model-list-category-title">
              <span
                className="search-result-swatch"
                style={{ background: `light-dark(${category.colorLight}, ${category.colorDark})`, marginTop: 0 }}
              />
              {category.label}
            </h3>
            <ul className="conceptual-model-list-items">
              {items.map((node) => {
                const outgoing = relationshipEdges.filter((e) => e.source === node.id);
                const incoming = relationshipEdges.filter((e) => e.target === node.id);
                const specializes = specializationEdges.filter((e) => e.source === node.id);
                const specializedBy = specializationEdges.filter((e) => e.target === node.id);

                const isSelected = node.id === selectedId;
                return (
                  <li
                    key={node.id}
                    className={`conceptual-model-list-item${isSelected ? ' selected' : ''}`}
                  >
                    <a href={`${base}concepts/${node.id}`} className="conceptual-model-list-item-label">
                      {node.label}
                    </a>
                    <span className="muted conceptual-model-list-item-badge">{inclusionBadge(node)}</span>
                    <button
                      type="button"
                      className="link-button conceptual-model-list-item-inspect"
                      aria-pressed={isSelected}
                      onClick={() => onSelect(isSelected ? null : node.id)}
                    >
                      {isSelected ? 'Hide details' : 'Details'}
                    </button>

                    {(specializes.length > 0 || specializedBy.length > 0 || outgoing.length > 0 || incoming.length > 0) && (
                      <ul className="conceptual-model-list-edges">
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
                            → {e.label} {nodesById.get(e.target)?.label ?? e.target}
                          </li>
                        ))}
                        {incoming.map((e) => (
                          <li key={e.id}>
                            ← {nodesById.get(e.source)?.label ?? e.source} {e.label}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
