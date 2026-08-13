import { CATEGORIES } from '../../data/categories';
import type { LogicalEntityType, LogicalModel } from '../../data/logical-model';

interface Props {
  model: LogicalModel;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

const ENTITY_TYPE_LABELS: Record<LogicalEntityType, string> = {
  entity: 'Entity',
  'abstract-entity': 'Abstract Entity',
  'reference-entity': 'Reference Entity',
};

/**
 * The list/table view of the Logical Model -- v1's only view (no custom
 * SVG/D3 ER diagram yet, see docs/10-program-model-generation.md's Logical
 * Model section for why). Mirrors ConceptualModelList.tsx's grouped-by-
 * category, textual-edges structure.
 */
export default function LogicalModelList({ model, selectedId, onSelect }: Props) {
  const entitiesById = new Map(model.entities.map((e) => [e.id, e]));

  return (
    <div className="conceptual-model-list">
      {CATEGORIES.map((category) => {
        const items = model.entities.filter((e) => e.category === category.id);
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
              {items.map((entity) => {
                const associations = model.associations.filter(
                  (a) => a.sourceEntityId === entity.id || a.targetEntityId === entity.id
                );
                const isSelected = entity.id === selectedId;
                return (
                  <li key={entity.id} className={`conceptual-model-list-item${isSelected ? ' selected' : ''}`}>
                    <span className="conceptual-model-list-item-label">{entity.label}</span>
                    <span className={`muted logical-entity-type-badge logical-entity-type-badge-${entity.entityType}`}>
                      {ENTITY_TYPE_LABELS[entity.entityType]}
                    </span>
                    <button
                      type="button"
                      className="link-button conceptual-model-list-item-inspect"
                      aria-pressed={isSelected}
                      onClick={() => onSelect(isSelected ? null : entity.id)}
                    >
                      {isSelected ? 'Hide details' : 'Details'}
                    </button>

                    <ul className="logical-attribute-list">
                      {entity.attributes.map((a) => (
                        <li key={a.id} className={a.inherited ? 'muted' : undefined}>
                          {a.logicalType === 'identifier' && <span className="logical-pk-marker">PK</span>}
                          {a.label} <span className="muted">({a.logicalType})</span>
                        </li>
                      ))}
                    </ul>

                    {associations.length > 0 && (
                      <ul className="conceptual-model-list-edges">
                        {associations.map((a) => {
                          const outgoing = a.sourceEntityId === entity.id;
                          const otherId = outgoing ? a.targetEntityId : a.sourceEntityId;
                          const otherLabel = entitiesById.get(otherId)?.label ?? otherId;
                          if (a.type === 'specialization') {
                            return (
                              <li key={a.id} className="muted">
                                {outgoing ? `specializes ${otherLabel}` : `specialized by ${otherLabel}`}
                              </li>
                            );
                          }
                          return (
                            <li key={a.id}>
                              {outgoing ? `→ ${a.label} ${otherLabel}` : `← ${otherLabel} ${a.label}`}
                            </li>
                          );
                        })}
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
