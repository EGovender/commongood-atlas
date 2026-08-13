// Pure questionnaire-answer utilities, shared by DesignWizard and the Program
// Model Workbench so the two interpret answers identically (see
// docs/10-program-model-generation.md). No window/document/React dependency
// here -- URL reading/writing is a thin wrapper around these, not baked in.
import { DESIGN_QUESTIONS, type DesignQuestion } from '../design-questions';

export type IgnoredAnswerReason = 'hidden-by-dependency' | 'unknown-question' | 'invalid-value';

export interface IgnoredAnswer {
  questionId: string;
  value: string;
  reason: IgnoredAnswerReason;
}

export interface NormalizedAnswers {
  answers: Record<string, string>;
  ignored: IgnoredAnswer[];
}

/** A question with a `showIf` is visible only when the answer it depends on
 * matches. `showIf` is deliberately never chained more than one level deep
 * (see design-questions.ts's own header comment), so this needs no recursion. */
export function isQuestionVisible(question: DesignQuestion, answers: Record<string, string>): boolean {
  if (!question.showIf) return true;
  return answers[question.showIf.questionId] === question.showIf.equals;
}

function isValidAnswerValue(question: DesignQuestion, value: string): boolean {
  if (question.type === 'boolean') return value === 'yes' || value === 'no';
  return question.options.some((o) => o.value === value);
}

/**
 * Turns a raw, untrusted answer map (from a URL, a hand-edited query string,
 * or a future API/CLI caller) into a clean answer set plus a record of what
 * was dropped and why. Two passes:
 *  1. Structural validity -- does the question exist, is the value a shape
 *     that question accepts.
 *  2. Currently-applicable -- is the question's own `showIf` (if any)
 *     satisfied by the structurally-valid answers. A stale answer to a
 *     now-hidden follow-up question (e.g. site-visit=yes after review is
 *     changed to No) is ignored here, not left to silently keep influencing
 *     anything downstream.
 */
export function normalizeAnswers(
  raw: Record<string, string>,
  questions: DesignQuestion[] = DESIGN_QUESTIONS
): NormalizedAnswers {
  const byId = new Map(questions.map((q) => [q.id, q]));
  const structurallyValid: Record<string, string> = {};
  const ignored: IgnoredAnswer[] = [];

  for (const [questionId, value] of Object.entries(raw)) {
    if (!value) continue;
    const question = byId.get(questionId);
    if (!question) {
      ignored.push({ questionId, value, reason: 'unknown-question' });
      continue;
    }
    if (!isValidAnswerValue(question, value)) {
      ignored.push({ questionId, value, reason: 'invalid-value' });
      continue;
    }
    structurallyValid[questionId] = value;
  }

  const answers: Record<string, string> = {};
  for (const [questionId, value] of Object.entries(structurallyValid)) {
    const question = byId.get(questionId)!;
    if (isQuestionVisible(question, structurallyValid)) {
      answers[questionId] = value;
    } else {
      ignored.push({ questionId, value, reason: 'hidden-by-dependency' });
    }
  }

  ignored.sort((a, b) => a.questionId.localeCompare(b.questionId));

  return { answers, ignored };
}

/** Reads raw (unvalidated) answer strings out of a query string -- only for
 * question ids we know about, since question ids double as param names.
 * Validation/visibility is normalizeAnswers()'s job, not this function's, so
 * a bad or stale value is captured as an ignored answer rather than silently
 * vanishing before it can be recorded. */
export function parseAnswersFromSearchParams(
  search: string | URLSearchParams,
  questions: DesignQuestion[] = DESIGN_QUESTIONS
): Record<string, string> {
  const params = typeof search === 'string' ? new URLSearchParams(search) : search;
  const raw: Record<string, string> = {};
  for (const q of questions) {
    const value = params.get(q.id);
    if (value) raw[q.id] = value;
  }
  return raw;
}

export function writeAnswersToSearchParams(
  answers: Record<string, string>,
  questions: DesignQuestion[] = DESIGN_QUESTIONS
): URLSearchParams {
  const params = new URLSearchParams();
  for (const q of questions) {
    if (answers[q.id]) params.set(q.id, answers[q.id]);
  }
  return params;
}

export function getAnswerLabel(question: DesignQuestion, value: string): string {
  if (question.type === 'boolean') return value === 'yes' ? 'Yes' : 'No';
  return question.options.find((o) => o.value === value)?.label ?? value;
}
