// The typed effect a single questionnaire answer has on a Program Profile.
// Current questions only ever select concepts (BooleanQuestion's yes/no,
// SingleSelectOption's concepts), so resolveQuestionEffect() below only ever
// produces { concepts }. properties/referenceSchemes exist on the type now,
// forward-compatible with a future question that needs to say "this specific
// attribute is relevant" without pretending it's a standalone concept (see
// docs/10-program-model-generation.md) -- but nothing fabricates a use for
// them ahead of real question data that needs one, matching how this
// project's reference-data layer leaves a facet registered-but-unpopulated
// rather than inventing placeholder values for it.
import type { DesignQuestion } from '../design-questions';

export interface ProgramModelEffect {
  concepts?: string[];
  properties?: string[];
  referenceSchemes?: string[];
}

/** Normalizes a question + the answer actually given into its typed effect. */
export function resolveQuestionEffect(question: DesignQuestion, answerValue: string): ProgramModelEffect {
  if (question.type === 'boolean') {
    return { concepts: answerValue === 'yes' ? question.yes : question.no };
  }
  const option = question.options.find((o) => o.value === answerValue);
  return { concepts: option?.concepts ?? [] };
}
