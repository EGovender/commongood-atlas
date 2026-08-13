import { useMemo, useState } from 'react';
import { getCategory } from '../../data/categories';
import { conceptSearchScore } from '../../data/search';
import { requireConcept } from '../../data/ontology';
import type { ConceptualModel } from '../../data/program-model';

interface Props {
  model: ConceptualModel;
  onSelect: (id: string) => void;
}

/**
 * Search scoped to the current model only -- reuses the same
 * conceptSearchScore() relevance scoring SearchBox.tsx uses site-wide, but
 * never navigates to the global /concepts page (see docs/10-program-model-
 * generation.md): picking a result selects it, opening the same Inspector
 * a diagram/list click would.
 */
export default function ProgramModelSearch({ model, onSelect }: Props) {
  const [query, setQuery] = useState('');

  const results = useMemo(() => {
    const q = query.trim();
    if (!q) return [];
    return model.nodes
      .map((n) => ({ node: n, score: conceptSearchScore(requireConcept(n.id), q) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map((r) => r.node);
  }, [model, query]);

  function selectResult(id: string) {
    onSelect(id);
    setQuery('');
  }

  return (
    <div className="search-box program-model-search">
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search your model…"
        aria-label="Search your model"
        className="search-input"
      />
      {results.length > 0 && (
        <ul className="search-results" role="listbox">
          {results.map((n) => {
            const category = getCategory(n.category);
            return (
              <li key={n.id}>
                <button type="button" className="search-result-button" onClick={() => selectResult(n.id)}>
                  <span
                    className="search-result-swatch"
                    style={{ background: `light-dark(${category.colorLight}, ${category.colorDark})` }}
                  />
                  <span>
                    <strong>{n.label}</strong>
                    <span className="search-result-def"> - {n.definition}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {query.trim() && results.length === 0 && (
        <p className="muted search-no-results">No concepts in your model match "{query}".</p>
      )}
    </div>
  );
}
