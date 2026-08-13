import { CATEGORIES } from '../../data/categories';
import type { ProgramProfile } from '../../data/program-model';

interface Props {
  profile: ProgramProfile;
}

/** The workbench's left overview panel -- counts, category breakdown,
 * warnings. Program-Profile-driven, same inclusion categories as
 * DesignWizard's sidebar (Foundation / Added from your answers / Supporting
 * structure), so the two can never disagree. */
export default function ProgramModelSummary({ profile }: Props) {
  const categoryCounts = CATEGORIES.map((category) => ({
    category,
    count: profile.concepts.filter((c) => c.category === category.id).length,
  })).filter((c) => c.count > 0);

  return (
    <div className="program-model-summary">
      <h2 className="inspector-group-title">Your model</h2>
      <p className="program-model-summary-count">{profile.stats.totalConcepts} concepts</p>
      <ul className="program-model-summary-breakdown">
        <li>
          Foundation <span>{profile.stats.foundationConcepts}</span>
        </li>
        <li>
          From your answers <span>{profile.stats.answerSelectedConcepts}</span>
        </li>
        <li>
          Supporting structure <span>{profile.stats.supportingConcepts}</span>
        </li>
      </ul>

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

      {profile.warnings.length > 0 && (
        <div className="program-model-warnings">
          <h3 className="inspector-group-title">Warnings ({profile.warnings.length})</h3>
          <ul>
            {profile.warnings.map((w, i) => (
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
