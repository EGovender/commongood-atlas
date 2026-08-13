import { useEffect, useMemo, useState } from 'react';
import { DESIGN_QUESTIONS, DESIGN_SECTIONS } from '../data/design-questions';
import {
  buildDesignJson,
  buildDesignJsonLd,
  buildDesignMarkdown,
  buildDesignSummary,
  downloadFile,
} from '../data/design-export';
import { concepts } from '../data/ontology';
import { getCategory } from '../data/categories';
import {
  isQuestionVisible,
  normalizeAnswers,
  parseAnswersFromSearchParams,
  writeAnswersToSearchParams,
} from '../data/program-model/answers';
import { buildProgramProfile, buildProgramProfileJson } from '../data/program-model';

interface Props {
  base: string;
}

export default function DesignWizard({ base }: Props) {
  // Starts empty (matching the server-rendered HTML) rather than reading the
  // URL eagerly -- doing that in the initializer would make the client's
  // first render disagree with the SSR-ed markup (0 answered on the server,
  // N on the client) and trigger a React hydration-mismatch, discarding and
  // re-rendering the whole tree. Restoring after mount, in an effect, avoids
  // that: it runs after hydration has already reconciled successfully.
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const raw = parseAnswersFromSearchParams(window.location.search);
    const { answers: restored } = normalizeAnswers(raw);
    if (Object.keys(restored).length > 0) setAnswers(restored);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visibleQuestions = useMemo(
    () => DESIGN_QUESTIONS.filter((q) => isQuestionVisible(q, answers)),
    [answers]
  );

  // The single source of truth for "what's in the model and why" -- the
  // questionnaire sidebar and the /design/model/ workspace both derive from
  // this, so they can never disagree about a concept's inclusion or its
  // provenance. buildProgramProfile normalizes `answers` itself, so passing
  // the (already-normalized) state through again is cheap and safe.
  const profile = useMemo(() => buildProgramProfile(answers), [answers]);
  const profileConceptIds = useMemo(() => new Set(profile.concepts.map((c) => c.id)), [profile]);

  // Keep the URL in sync so the current answer set is a shareable link.
  useEffect(() => {
    const qs = writeAnswersToSearchParams(answers).toString();
    const url = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
    window.history.replaceState(null, '', url);
  }, [answers]);

  // Re-normalizing on every change (rather than just merging the new value
  // in) means a stale answer to a question that just became hidden -- e.g.
  // site-visit=yes after flipping review to No -- is dropped immediately,
  // instead of silently continuing to occupy state/the URL. See
  // normalizeAnswers() for why this needs no recursion despite reasoning
  // about visibility: showIf is never chained more than one level deep.
  function setAnswer(questionId: string, value: string) {
    setAnswers((prev) => normalizeAnswers({ ...prev, [questionId]: value }).answers);
  }

  function reset() {
    setAnswers({});
  }

  // Foundation / Added from your answers / Supporting structure -- the
  // Program Profile's own inclusion categories (see docs/10-program-model-
  // generation.md), replacing the flat "core vs added" split. Supporting
  // structure starts collapsed since it wasn't something the questionnaire
  // specifically recommended, just what the model needs to stay coherent.
  const inclusionGroups = [
    {
      id: 'foundation',
      label: 'Foundation',
      showReasons: false,
      items: profile.concepts.filter((c) => c.inclusionKinds.includes('foundation')),
    },
    {
      id: 'answers',
      label: 'Added from your answers',
      showReasons: true,
      items: profile.concepts.filter((c) => c.direct && !c.inclusionKinds.includes('foundation')),
    },
    {
      id: 'supporting',
      label: 'Supporting structure',
      showReasons: true,
      items: profile.concepts.filter((c) => !c.direct),
    },
  ].filter((g) => g.items.length > 0);

  const recommendedConcepts = concepts.filter((c) => profileConceptIds.has(c.id));
  const excluded = concepts.filter((c) => !profileConceptIds.has(c.id));

  function exportAs(format: 'json' | 'jsonld' | 'markdown') {
    const input = { answers, recommended: recommendedConcepts, excluded };
    if (format === 'json') {
      downloadFile('commongood-atlas-design.json', buildDesignJson(input), 'application/json');
    } else if (format === 'jsonld') {
      downloadFile('commongood-atlas-design.jsonld', buildDesignJsonLd(recommendedConcepts), 'application/ld+json');
    } else {
      downloadFile('commongood-atlas-design.md', buildDesignMarkdown(input), 'text/markdown');
    }
  }

  function downloadProgramProfile() {
    downloadFile('commongood-atlas-program-profile.json', buildProgramProfileJson(profile), 'application/json');
  }

  function downloadSummary() {
    const input = { answers, recommended: recommendedConcepts, excluded };
    downloadFile(
      'commongood-atlas-program-summary.md',
      buildDesignSummary(input, visibleQuestions, DESIGN_SECTIONS),
      'text/markdown'
    );
  }

  function copyLink() {
    if (typeof navigator === 'undefined' || !navigator.clipboard) return;
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  const openInGraphHref = `${base}explore?concepts=${profile.concepts.map((c) => c.id).join(',')}`;
  const modelQueryString = writeAnswersToSearchParams(answers).toString();
  const modelHref = `${base}design/model/${modelQueryString ? `?${modelQueryString}` : ''}`;

  return (
    <div className="design-wizard">
      <div className="design-questions">
        <div className="design-progress-header">
          <div className="design-progress-label">
            <span>Your progress</span>
            <span className="muted">
              {profile.stats.answeredQuestions} of {profile.stats.applicableQuestions} answered
            </span>
          </div>
          <progress
            className="design-progress-bar"
            value={profile.stats.answeredQuestions}
            max={profile.stats.applicableQuestions}
          />
          <button type="button" className="link-button design-progress-reset" onClick={reset}>
            Reset
          </button>
        </div>

        {DESIGN_SECTIONS.map((section, sectionIndex) => {
          const sectionQuestions = DESIGN_QUESTIONS.filter(
            (q) => q.section === section.id && isQuestionVisible(q, answers)
          );
          if (sectionQuestions.length === 0) return null;
          const sectionAnswered = sectionQuestions.filter((q) => answers[q.id]).length;
          return (
            <section key={section.id} className="design-section">
              <div className="page-section-header">
                <div className="page-section-heading">
                  <span className="page-section-kicker">{String(sectionIndex + 1).padStart(2, '0')}</span>
                  <h2 className="page-section-title">{section.label}</h2>
                </div>
                <span className="page-section-count">
                  {sectionAnswered}/{sectionQuestions.length} answered
                </span>
              </div>
              {sectionQuestions.map((q) => (
                <fieldset key={q.id} className="design-question">
                  <legend>{q.text}</legend>
                  {q.help && (
                    <details className="design-question-help">
                      <summary>Why we're asking</summary>
                      <p className="muted">{q.help}</p>
                    </details>
                  )}
                  {q.type === 'boolean' ? (
                    <div className="design-options">
                      {(['yes', 'no'] as const).map((v) => (
                        <label key={v} className={`design-option${answers[q.id] === v ? ' selected' : ''}`}>
                          <input
                            type="radio"
                            name={q.id}
                            value={v}
                            checked={answers[q.id] === v}
                            onChange={() => setAnswer(q.id, v)}
                          />
                          {v === 'yes' ? 'Yes' : 'No'}
                        </label>
                      ))}
                    </div>
                  ) : (
                    <div className="design-options">
                      {q.options.map((opt) => (
                        <label
                          key={opt.value}
                          className={`design-option${answers[q.id] === opt.value ? ' selected' : ''}`}
                        >
                          <input
                            type="radio"
                            name={q.id}
                            value={opt.value}
                            checked={answers[q.id] === opt.value}
                            onChange={() => setAnswer(q.id, opt.value)}
                          />
                          {opt.label}
                        </label>
                      ))}
                    </div>
                  )}
                </fieldset>
              ))}
            </section>
          );
        })}
      </div>

      <aside className="design-result">
        <div className="design-result-summary">
          <h2 className="inspector-group-title">Your model</h2>
          <p className="design-result-summary-count">{profile.stats.totalConcepts} concepts recommended</p>
          <p className="design-result-summary-split">
            {profile.stats.foundationConcepts} foundation
            <br />
            {profile.stats.answerSelectedConcepts} added from your answers
            <br />
            {profile.stats.supportingConcepts} supporting structure
          </p>
        </div>
        <p className="secondary design-foundation-note">
          Foundation concepts apply to most grantmaking programs, whether or not you've answered anything below;
          the rest are included because of a specific answer, or because the model needs them to stay coherent.
        </p>

        <div className="design-actions">
          <a className="home-cta home-cta-primary" href={modelHref}>
            View conceptual model
          </a>
          <a className="home-cta" href={openInGraphHref}>
            Open in graph
          </a>
          <button type="button" className="home-cta" onClick={downloadSummary}>
            Download summary
          </button>
          <button type="button" className="link-button" onClick={copyLink}>
            {copied ? 'Link copied!' : 'Copy shareable link'}
          </button>
        </div>

        <details className="design-developer-exports">
          <summary className="muted">Developer exports</summary>
          <div className="design-actions design-actions-export">
            <button type="button" className="link-button" onClick={() => exportAs('json')}>
              JSON
            </button>
            <button type="button" className="link-button" onClick={() => exportAs('jsonld')}>
              JSON-LD
            </button>
            <button type="button" className="link-button" onClick={() => exportAs('markdown')}>
              Markdown
            </button>
            <button type="button" className="link-button" onClick={downloadProgramProfile}>
              Program Profile JSON
            </button>
          </div>
        </details>

        {inclusionGroups.map((group) => (
          <details key={group.id} className="inspector-group" open={group.id !== 'supporting'}>
            <summary className="inspector-group-title">
              {group.label} ({group.items.length})
            </summary>
            <ul className="design-concept-list">
              {group.items.map((c) => {
                const category = getCategory(c.category);
                return (
                  <li key={c.id}>
                    <span
                      className="search-result-swatch"
                      style={{ background: `light-dark(${category.colorLight}, ${category.colorDark})` }}
                    />
                    <a href={`${base}concepts/${c.id}`}>{c.label}</a>
                    {group.showReasons && c.reasons.length > 0 && (
                      <div className="muted design-reason">
                        {c.reasons.map((r, i) => (
                          <div key={i}>{r.explanation}</div>
                        ))}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </details>
        ))}

        {excluded.length > 0 && (
          <details className="design-excluded">
            <summary className="muted">Not currently selected ({excluded.length})</summary>
            <ul className="design-concept-list">
              {excluded.map((c) => (
                <li key={c.id} className="muted">
                  <a href={`${base}concepts/${c.id}`}>{c.label}</a>
                </li>
              ))}
            </ul>
          </details>
        )}
      </aside>
    </div>
  );
}
