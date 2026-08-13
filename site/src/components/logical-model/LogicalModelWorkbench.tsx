import { useEffect, useMemo, useState } from 'react';
import { downloadFile } from '../../data/design-export';
import { ontologyVersion } from '../../data/ontology';
import { buildLogicalModel, buildLogicalModelJson, buildLogicalModelMarkdown, buildLogicalModelMermaid } from '../../data/logical-model';
import { buildProgramProfile, normalizeAnswers, parseAnswersFromSearchParams, writeAnswersToSearchParams } from '../../data/program-model';
import LogicalModelSummary from './LogicalModelSummary';
import LogicalModelList from './LogicalModelList';
import LogicalModelInspector from './LogicalModelInspector';

interface Props {
  base: string;
}

/**
 * The /design/logical-model/ workspace: reads the same answer query-string
 * DesignWizard/ProgramModelWorkbench write, regenerates the Program Profile
 * and its Logical Model projection from scratch, and renders it. Mirrors
 * ProgramModelWorkbench.tsx, but list-only for v1 -- no diagram view yet
 * (see docs/10-program-model-generation.md's Logical Model section).
 */
export default function LogicalModelWorkbench({ base }: Props) {
  const [answers, setAnswers] = useState<Record<string, string>>({});

  useEffect(() => {
    const raw = parseAnswersFromSearchParams(window.location.search);
    const { answers: restored } = normalizeAnswers(raw);
    setAnswers(restored);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const profile = useMemo(() => buildProgramProfile(answers), [answers]);
  const model = useMemo(() => buildLogicalModel(profile), [profile]);

  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    setSelectedId(null);
  }, [model]);

  const answersQueryString = writeAnswersToSearchParams(answers).toString();
  const editAnswersHref = `${base}design/${answersQueryString ? `?${answersQueryString}` : ''}`;
  const conceptualModelHref = `${base}design/model/${answersQueryString ? `?${answersQueryString}` : ''}`;

  function downloadJson() {
    downloadFile('commongood-atlas-logical-model.json', buildLogicalModelJson(model), 'application/json');
  }
  function downloadMarkdown() {
    downloadFile('commongood-atlas-logical-model.md', buildLogicalModelMarkdown(model), 'text/markdown');
  }
  function downloadMermaid() {
    downloadFile('commongood-atlas-logical-model.mmd', buildLogicalModelMermaid(model), 'text/plain');
  }

  return (
    <div className="program-model-workbench">
      <div className="program-model-header">
        <div className="program-model-header-stats">
          <span>
            <strong>{model.stats.entities}</strong> entities
          </span>
          <span>
            <strong>{model.stats.attributes}</strong> attributes
          </span>
          <span>
            <strong>{model.stats.businessAssociations + model.stats.specializationAssociations}</strong> associations
          </span>
          <span className="muted">Ontology v{ontologyVersion}</span>
        </div>
        <div className="program-model-header-actions">
          <a className="home-cta" href={conceptualModelHref}>
            Conceptual model
          </a>
          <a className="home-cta" href={editAnswersHref}>
            Edit answers
          </a>
          <details className="program-model-download">
            <summary className="home-cta home-cta-primary">Download model</summary>
            <div className="program-model-download-menu">
              <button type="button" className="link-button" onClick={downloadJson}>
                Logical Model JSON
              </button>
              <button type="button" className="link-button" onClick={downloadMarkdown}>
                Logical Model Markdown
              </button>
              <button type="button" className="link-button" onClick={downloadMermaid}>
                Mermaid ER diagram
              </button>
            </div>
          </details>
        </div>
      </div>

      <div className="custom-view-banner">
        <p>
          A database-independent projection of your Program Model into entities, attributes, and associations.
          Cardinality and abstract-entity classification are inferred where the ontology has no data for them --
          see each entity's warnings for details. Physical/database mapping is a future step, not shown here.
        </p>
      </div>

      <div className={`program-model-workspace${selectedId ? ' has-inspector' : ''}`}>
        <aside className="program-model-sidebar">
          <LogicalModelSummary model={model} />
        </aside>
        <div className="program-model-center">
          <LogicalModelList model={model} selectedId={selectedId} onSelect={setSelectedId} />
        </div>
        {selectedId && (
          <aside className="program-model-inspector">
            <LogicalModelInspector model={model} selectedId={selectedId} />
          </aside>
        )}
      </div>
    </div>
  );
}
