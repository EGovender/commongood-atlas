import { useEffect, useMemo, useState } from 'react';
import { CORE_CONCEPTS, DESIGN_QUESTIONS, DESIGN_SECTIONS } from '../data/design-questions';
import {
  buildDesignJson,
  buildDesignJsonLd,
  buildDesignMarkdown,
  buildDesignSummary,
  downloadFile,
} from '../data/design-export';
import { concepts, requireConcept } from '../data/ontology';
import { CATEGORIES } from '../data/categories';
import {
  isQuestionVisible,
  normalizeAnswers,
  parseAnswersFromSearchParams,
  writeAnswersToSearchParams,
} from '../data/program-model/answers';

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

  // Tracks WHY each recommended concept is included -- "foundation" (every
  // program needs it, regardless of answers) or the question/answer that
  // added it -- so the result list can show its reason instead of just
  // appearing with no explanation. First cause wins; a concept added by an
  // earlier question keeps that reason even if a later one would also add it.
  const { recommendedIds, reasonByConceptId } = useMemo(() => {
    const ids = new Set(CORE_CONCEPTS);
    const reasons = new Map<string, string>();
    for (const id of CORE_CONCEPTS) reasons.set(id, 'Foundation: every grantmaking program needs this.');
    for (const q of visibleQuestions) {
      const answer = answers[q.id];
      if (!answer) continue;
      let added: string[];
      let answerLabel: string;
      if (q.type === 'boolean') {
        added = answer === 'yes' ? q.yes : q.no;
        answerLabel = answer === 'yes' ? 'Yes' : 'No';
      } else {
        const opt = q.options.find((o) => o.value === answer);
        added = opt?.concepts ?? [];
        answerLabel = opt?.label ?? answer;
      }
      for (const id of added) {
        ids.add(id);
        if (!reasons.has(id)) reasons.set(id, `Because you answered "${answerLabel}" to: ${q.text}`);
      }
    }
    return { recommendedIds: ids, reasonByConceptId: reasons };
  }, [answers, visibleQuestions]);

  const answeredCount = visibleQuestions.filter((q) => answers[q.id]).length;

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

  const recommendedByCategory = CATEGORIES.map((cat) => ({
    category: cat,
    items: concepts.filter((c) => c.category === cat.id && recommendedIds.has(c.id)),
  })).filter((g) => g.items.length > 0);

  const recommendedConcepts = concepts.filter((c) => recommendedIds.has(c.id));
  const excluded = concepts.filter((c) => !recommendedIds.has(c.id));

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

  const openInGraphHref = `${base}explore?concepts=${Array.from(recommendedIds).join(',')}`;

  return (
    <div className="design-wizard">
      <div className="design-questions">
        <div className="design-progress-header">
          <div className="design-progress-label">
            <span>Your progress</span>
            <span className="muted">
              {answeredCount} of {visibleQuestions.length} answered
            </span>
          </div>
          <progress className="design-progress-bar" value={answeredCount} max={visibleQuestions.length} />
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
          <p className="design-result-summary-count">{recommendedIds.size} concepts recommended</p>
          <p className="design-result-summary-split">
            {CORE_CONCEPTS.filter((id) => recommendedIds.has(id)).length} core concepts
            <br />
            {recommendedIds.size - CORE_CONCEPTS.filter((id) => recommendedIds.has(id)).length} added from your
            answers
          </p>
        </div>
        <p className="secondary design-foundation-note">
          Core concepts apply to most grantmaking programs, whether or not you've answered anything below; the
          rest are included because of a specific answer.
        </p>

        <div className="design-actions">
          <a className="home-cta home-cta-primary" href={openInGraphHref}>
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
          </div>
        </details>

        {recommendedByCategory.map(({ category, items }) => (
          <section key={category.id} className="inspector-group">
            <h3 className="inspector-group-title" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <span
                className="search-result-swatch"
                style={{ background: `light-dark(${category.colorLight}, ${category.colorDark})`, marginTop: 0 }}
              />
              {category.label}
            </h3>
            <ul className="design-concept-list">
              {items.map((c) => (
                <li key={c.id}>
                  <a href={`${base}concepts/${c.id}`}>{requireConcept(c.id).label}</a>
                  {reasonByConceptId.get(c.id) && !CORE_CONCEPTS.includes(c.id) && (
                    <div className="muted design-reason">{reasonByConceptId.get(c.id)}</div>
                  )}
                </li>
              ))}
            </ul>
          </section>
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
