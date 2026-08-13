import { describe, it, expect } from 'vitest';
import { DESIGN_QUESTIONS } from '../../design-questions';
import {
  getAnswerLabel,
  isQuestionVisible,
  normalizeAnswers,
  parseAnswersFromSearchParams,
  writeAnswersToSearchParams,
} from '../answers';

const review = DESIGN_QUESTIONS.find((q) => q.id === 'review')!;
const siteVisit = DESIGN_QUESTIONS.find((q) => q.id === 'site-visit')!;
const fundingRestriction = DESIGN_QUESTIONS.find((q) => q.id === 'funding-restriction')!;

describe('isQuestionVisible', () => {
  it('is always visible when there is no showIf', () => {
    expect(isQuestionVisible(review, {})).toBe(true);
  });

  it('is visible when the controlling answer matches', () => {
    expect(isQuestionVisible(siteVisit, { review: 'yes' })).toBe(true);
  });

  it('is hidden when the controlling answer does not match', () => {
    expect(isQuestionVisible(siteVisit, { review: 'no' })).toBe(false);
    expect(isQuestionVisible(siteVisit, {})).toBe(false);
  });
});

describe('normalizeAnswers', () => {
  it('returns an empty result for no answers', () => {
    expect(normalizeAnswers({})).toEqual({ answers: {}, ignored: [] });
  });

  it('keeps a simple valid boolean answer', () => {
    const { answers, ignored } = normalizeAnswers({ review: 'yes' });
    expect(answers).toEqual({ review: 'yes' });
    expect(ignored).toEqual([]);
  });

  it('keeps a visible conditional answer', () => {
    const { answers } = normalizeAnswers({ review: 'yes', 'site-visit': 'yes' });
    expect(answers).toEqual({ review: 'yes', 'site-visit': 'yes' });
  });

  it('drops a stale hidden answer and records why', () => {
    const { answers, ignored } = normalizeAnswers({ review: 'no', 'site-visit': 'yes' });
    expect(answers).toEqual({ review: 'no' });
    expect(ignored).toEqual([{ questionId: 'site-visit', value: 'yes', reason: 'hidden-by-dependency' }]);
  });

  it('drops an answer to an unknown question id', () => {
    const { answers, ignored } = normalizeAnswers({ 'not-a-real-question': 'yes' });
    expect(answers).toEqual({});
    expect(ignored).toEqual([{ questionId: 'not-a-real-question', value: 'yes', reason: 'unknown-question' }]);
  });

  it('drops an invalid boolean value', () => {
    const { answers, ignored } = normalizeAnswers({ review: 'maybe' });
    expect(answers).toEqual({});
    expect(ignored).toEqual([{ questionId: 'review', value: 'maybe', reason: 'invalid-value' }]);
  });

  it('drops an invalid single-select value', () => {
    const { answers, ignored } = normalizeAnswers({ 'funding-restriction': 'sometimes' });
    expect(answers).toEqual({});
    expect(ignored).toEqual([{ questionId: 'funding-restriction', value: 'sometimes', reason: 'invalid-value' }]);
  });

  it('keeps a valid single-select value', () => {
    const { answers } = normalizeAnswers({ 'funding-restriction': 'varies' });
    expect(answers).toEqual({ 'funding-restriction': 'varies' });
  });
});

describe('parseAnswersFromSearchParams / writeAnswersToSearchParams round-trip', () => {
  it('extracts only known question ids from a query string', () => {
    const raw = parseAnswersFromSearchParams('?review=yes&bogus=yes&installments=no');
    expect(raw).toEqual({ review: 'yes', installments: 'no' });
  });

  it('writes params in DESIGN_QUESTIONS order and round-trips', () => {
    const answers = { installments: 'yes', review: 'yes' };
    const params = writeAnswersToSearchParams(answers);
    const roundTripped = parseAnswersFromSearchParams(params);
    expect(roundTripped).toEqual(answers);

    const reviewIndex = params.toString().indexOf('review');
    const installmentsIndex = params.toString().indexOf('installments');
    const questionOrderReviewIndex = DESIGN_QUESTIONS.findIndex((q) => q.id === 'review');
    const questionOrderInstallmentsIndex = DESIGN_QUESTIONS.findIndex((q) => q.id === 'installments');
    expect(reviewIndex < installmentsIndex).toBe(questionOrderReviewIndex < questionOrderInstallmentsIndex);
  });

  it('omits unanswered questions', () => {
    const params = writeAnswersToSearchParams({ review: 'yes' });
    expect(params.has('installments')).toBe(false);
  });
});

describe('getAnswerLabel', () => {
  it('labels boolean answers', () => {
    expect(getAnswerLabel(review, 'yes')).toBe('Yes');
    expect(getAnswerLabel(review, 'no')).toBe('No');
  });

  it('labels single-select answers from the matching option', () => {
    expect(getAnswerLabel(fundingRestriction, 'varies')).toBe('Depends on the grant');
  });

  it('falls back to the raw value for an unrecognized single-select value', () => {
    expect(getAnswerLabel(fundingRestriction, 'mystery')).toBe('mystery');
  });
});
