import { CATEGORIES } from '../../data/categories';
import type { LogicalModel } from '../../data/logical-model';

interface Props {
  model: LogicalModel;
}

/** The workbench's left overview panel -- counts, category breakdown,
 * warnings. Mirrors ProgramModelSummary.tsx. */
export default function LogicalModelSummary({ model }: Props) {
  const categoryCounts = CATEGORIES.map((category) => ({
    category,
    count: model.entities.filter((e) => e.category === category.id).length,
  })).filter((c) => c.count > 0);

  return (
    <div className="program-model-summary">
      <h2 className="inspector-group-title">Your logical model</h2>
      <p className="program-model-summary-count">{model.stats.entities} entities</p>
      <ul className="program-model-summary-breakdown">
        <li>
          Entities <span>{model.stats.entities - model.stats.abstractEntities - model.stats.referenceEntities}</span>
        </li>
        <li>
          Abstract entities <span>{model.stats.abstractEntities}</span>
        </li>
        <li>
          Reference entities <span>{model.stats.referenceEntities}</span>
        </li>
      </ul>
      <p className="muted">
        {model.stats.attributes} attributes · {model.stats.businessAssociations} business associations ·{' '}
        {model.stats.specializationAssociations} specializations
      </p>

      <h3 className="inspector-group-title">Categories</h3>
      <ul className="program-model-category-list">
        {categoryCounts.map(({ category, count }) => (
          <li key={category.id}>
            <span
              className="search-result-swatch"
              style={{ background: `light-dark(${category.colorLight}, ${category.colorDark})` }}
            />
            <span className="program-model-category-label">{category.label}</span>
            <span className="muted">{count}</span>
          </li>
        ))}
      </ul>

      {model.warnings.length > 0 && (
        <div className="program-model-warnings">
          <h3 className="inspector-group-title">Warnings ({model.warnings.length})</h3>
          <ul>
            {model.warnings.map((w, i) => (
              <li key={i} className="muted">
                {w.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
