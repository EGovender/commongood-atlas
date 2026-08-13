import { useEffect, useMemo, useState } from 'react';
import { downloadFile } from '../../data/design-export';
import { ontologyVersion } from '../../data/ontology';
import {
  buildConceptualModel,
  buildConceptualModelJson,
  buildConceptualModelMarkdown,
  buildConceptualModelMermaid,
  buildProgramProfile,
  buildProgramProfileJson,
  normalizeAnswers,
  parseAnswersFromSearchParams,
  writeAnswersToSearchParams,
} from '../../data/program-model';
import ProgramModelSummary from './ProgramModelSummary';
import ConceptualModelList from './ConceptualModelList';
import ConceptualModelDiagram from './ConceptualModelDiagram';
import ConceptualModelInspector from './ConceptualModelInspector';

interface Props {
  base: string;
}

type ModelView = 'diagram' | 'list';

/**
 * The /design/model/ workspace: reads the same answer query-string
 * DesignWizard writes, regenerates the Program Profile and its Conceptual
 * Model from scratch (never just a passed-in concept list -- see
 * docs/10-program-model-generation.md), and renders it. No cross-tab sync
 * needed: editing answers on /design/ and coming back here re-derives
 * everything from the URL.
 */
export default function ProgramModelWorkbench({ base }: Props) {
  // Starts empty, matching the server-rendered markup, then restores from
  // the URL in an effect -- same hydration-safe pattern as DesignWizard.
  const [answers, setAnswers] = useState<Record<string, string>>({});

  useEffect(() => {
    const raw = parseAnswersFromSearchParams(window.location.search);
    const { answers: restored } = normalizeAnswers(raw);
    setAnswers(restored);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const profile = useMemo(() => buildProgramProfile(answers), [answers]);
  const model = useMemo(() => buildConceptualModel(profile), [profile]);

  const [view, setView] = useState<ModelView>('diagram');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // A selection from a previous model (different answers) can't carry over
  // -- the node may no longer exist, or mean something different.
  useEffect(() => {
    setSelectedId(null);
  }, [model]);

  const editAnswersQueryString = writeAnswersToSearchParams(answers).toString();
  const editAnswersHref = `${base}design/${editAnswersQueryString ? `?${editAnswersQueryString}` : ''}`;

  function downloadProgramProfile() {
    downloadFile('commongood-atlas-program-profile.json', buildProgramProfileJson(profile), 'application/json');
  }
  function downloadConceptualJson() {
    downloadFile('commongood-atlas-conceptual-model.json', buildConceptualModelJson(model), 'application/json');
  }
  function downloadConceptualMarkdown() {
    downloadFile('commongood-atlas-conceptual-model.md', buildConceptualModelMarkdown(profile), 'text/markdown');
  }
  function downloadMermaid() {
    downloadFile('commongood-atlas-conceptual-model.mmd', buildConceptualModelMermaid(model), 'text/plain');
  }

  const isIncomplete = profile.stats.answeredQuestions < profile.stats.applicableQuestions;

  return (
    <div className="program-model-workbench">
      <div className="program-model-header">
        <div className="program-model-header-stats">
          <span>
            <strong>{profile.stats.totalConcepts}</strong> concepts
          </span>
          <span>
            <strong>{profile.stats.relationships}</strong> relationships
          </span>
          <span>
            <strong>{profile.stats.properties}</strong> properties
          </span>
          <span className="muted">Ontology v{ontologyVersion}</span>
        </div>
        <div className="program-model-header-actions">
          <a className="home-cta" href={editAnswersHref}>
            Edit answers
          </a>
          <details className="program-model-download">
            <summary className="home-cta home-cta-primary">Download model</summary>
            <div className="program-model-download-menu">
              <button type="button" className="link-button" onClick={downloadProgramProfile}>
                Program Profile JSON
              </button>
              <button type="button" className="link-button" onClick={downloadConceptualJson}>
                Conceptual Model JSON
              </button>
              <button type="button" className="link-button" onClick={downloadConceptualMarkdown}>
                Conceptual Model Markdown
              </button>
              <button type="button" className="link-button" onClick={downloadMermaid}>
                Mermaid
              </button>
            </div>
          </details>
        </div>
      </div>

      {profile.answers.length === 0 ? (
        <div className="custom-view-banner">
          <p>
            Showing the CommonGood Atlas foundation model. No questionnaire responses were provided, so this model
            contains the concepts that apply broadly to grantmaking programs.
          </p>
          <a className="home-cta" href={`${base}design/`}>
            Answer the questionnaire
          </a>
        </div>
      ) : (
        isIncomplete && (
          <div className="custom-view-banner">
            <p>
              {profile.stats.answeredQuestions} of {profile.stats.applicableQuestions} applicable questions
              answered. Your model may expand as you answer more questions.
            </p>
          </div>
        )
      )}

      <div className={`program-model-workspace${selectedId ? ' has-inspector' : ''}`}>
        <aside className="program-model-sidebar">
          <ProgramModelSummary profile={profile} />
        </aside>
        <div className="program-model-center">
          <div className="program-model-view-toggle" role="group" aria-label="Model view">
            <button
              type="button"
              className={`program-model-view-toggle-button${view === 'diagram' ? ' active' : ''}`}
              aria-pressed={view === 'diagram'}
              onClick={() => setView('diagram')}
            >
              Diagram
            </button>
            <button
              type="button"
              className={`program-model-view-toggle-button${view === 'list' ? ' active' : ''}`}
              aria-pressed={view === 'list'}
              onClick={() => setView('list')}
            >
              List
            </button>
          </div>
          {view === 'diagram' ? (
            <ConceptualModelDiagram model={model} selectedId={selectedId} onSelect={setSelectedId} />
          ) : (
            <ConceptualModelList model={model} base={base} selectedId={selectedId} onSelect={setSelectedId} />
          )}
        </div>
        {selectedId && (
          <aside className="program-model-inspector">
            <ConceptualModelInspector profile={profile} model={model} selectedId={selectedId} base={base} />
          </aside>
        )}
      </div>
    </div>
  );
}
