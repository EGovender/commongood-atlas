import { getCategory } from '../../data/categories';
import type { LogicalEntityType, LogicalModel } from '../../data/logical-model';

interface Props {
  model: LogicalModel;
  selectedId: string | null;
}

const ENTITY_TYPE_LABELS: Record<LogicalEntityType, string> = {
  entity: 'Entity',
  'abstract-entity': 'Abstract Entity',
  'reference-entity': 'Reference Entity',
};

/**
 * The selected entity's detail panel -- mirrors ConceptualModelInspector.tsx,
 * including its aria-live="polite" selection-announcement convention.
 */
export default function LogicalModelInspector({ model, selectedId }: Props) {
  if (!selectedId) return null;

  const entity = model.entities.find((e) => e.id === selectedId);
  if (!entity) return null;

  const entitiesById = new Map(model.entities.map((e) => [e.id, e]));
  const associations = model.associations.filter(
    (a) => a.sourceEntityId === selectedId || a.targetEntityId === selectedId
  );
  const outgoing = associations.filter((a) => a.type === 'business' && a.sourceEntityId === selectedId);
  const incoming = associations.filter((a) => a.type === 'business' && a.targetEntityId === selectedId);
  const specializes = associations.filter((a) => a.type === 'specialization' && a.sourceEntityId === selectedId);
  const specializedBy = associations.filter((a) => a.type === 'specialization' && a.targetEntityId === selectedId);

  const category = getCategory(entity.category);

  return (
    <div className="conceptual-model-inspector" aria-live="polite">
      <h2 className="inspector-group-title conceptual-model-inspector-title">
        <span
          className="search-result-swatch"
          style={{ background: `light-dark(${category.colorLight}, ${category.colorDark})`, marginTop: 0 }}
        />
        {entity.label}
      </h2>
      <p className="muted conceptual-model-inspector-meta">
        {category.label} · {ENTITY_TYPE_LABELS[entity.entityType]}
      </p>
      <p>{entity.definition}</p>

      {entity.supertypeId && (
        <p className="muted">Supertype: {entitiesById.get(entity.supertypeId)?.label ?? entity.supertypeId}</p>
      )}

      <h3 className="inspector-group-title">Attributes ({entity.attributes.length})</h3>
      <ul>
        {entity.attributes.map((a) => (
          <li key={a.id}>
            {a.logicalType === 'identifier' && <span className="logical-pk-marker">PK</span>}
            {a.label} <span className="muted">({a.logicalType}{a.cardinality === 'many' ? ', many' : ''})</span>
            {a.required ? ' · required' : ''}
            {a.inherited ? ' · inherited' : ''}
          </li>
        ))}
      </ul>

      {(specializes.length > 0 || specializedBy.length > 0 || outgoing.length > 0 || incoming.length > 0) && (
        <>
          <h3 className="inspector-group-title">Associations</h3>
          <ul className="conceptual-model-inspector-relationships">
            {specializes.map((a) => (
              <li key={a.id} className="muted">
                specializes {entitiesById.get(a.targetEntityId)?.label ?? a.targetEntityId}
              </li>
            ))}
            {specializedBy.map((a) => (
              <li key={a.id} className="muted">
                specialized by {entitiesById.get(a.sourceEntityId)?.label ?? a.sourceEntityId}
              </li>
            ))}
            {outgoing.map((a) => (
              <li key={a.id}>
                {a.label} &rarr; {entitiesById.get(a.targetEntityId)?.label ?? a.targetEntityId}
              </li>
            ))}
            {incoming.map((a) => (
              <li key={a.id}>
                &larr; {entitiesById.get(a.sourceEntityId)?.label ?? a.sourceEntityId} {a.label}
              </li>
            ))}
          </ul>
          <p className="muted">Cardinality is unspecified for business associations -- see this model's warnings.</p>
        </>
      )}
    </div>
  );
}
