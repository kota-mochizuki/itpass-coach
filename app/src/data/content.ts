import questionsJson from './generated/questions.json';
import conceptsJson from './generated/concepts.json';
import metaJson from './generated/meta.json';
import type { Concept, Domain, Question } from '../domain/types';

export const ALL_QUESTIONS = questionsJson as unknown as Question[];
export const CONCEPTS = conceptsJson as unknown as Concept[];
export const META = metaJson as unknown as {
  built_at: string;
  syllabus: { title: string; url: string; published: string };
  exams: { exam_id: string; year: number; label: string; exam_name: string; time: number }[];
};

export const conceptById = new Map(CONCEPTS.map((c) => [c.concept_id, c]));
export const questionById = new Map(ALL_QUESTIONS.map((q) => [q.question_id, q]));

/** 学習対象として出題してよい問題か（2026年11月試験の現行範囲・品質確認済み） */
export function isStudyable(q: Question): boolean {
  return (
    q.exam_scope === 'CURRENT_2026' &&
    (q.validity_status === 'CURRENT' || q.validity_status === 'LEGACY_BUT_USEFUL') &&
    q.official_answer !== ''
  );
}

export const STUDY_QUESTIONS = ALL_QUESTIONS.filter(isStudyable);

/** Concept未分類の問題は分野の疑似Conceptで扱う */
export const pseudoConceptId = (d: Domain) => `D:${d}`;
export function primaryConcept(q: Question): string {
  return q.concept_ids[0] ?? pseudoConceptId(q.domain);
}
export function conceptLabel(id: string): string {
  const c = conceptById.get(id);
  if (!c) return id.startsWith('D:') ? 'その他' : id;
  // 小分類名と項目名が同じなら重ねない
  return c.small_name === c.concept_name ? c.concept_name : `${c.concept_name}（${c.small_name}）`;
}
export function conceptShort(id: string): string {
  const c = conceptById.get(id);
  return c ? c.concept_name : 'その他';
}

export const questionsByConcept = (() => {
  const m = new Map<string, Question[]>();
  for (const q of STUDY_QUESTIONS) {
    const ids = q.concept_ids.length ? q.concept_ids : [pseudoConceptId(q.domain)];
    for (const id of ids) {
      const arr = m.get(id) ?? [];
      arr.push(q);
      m.set(id, arr);
    }
  }
  return m;
})();

export const hasExplanation = (q: Question) => Boolean(q.short_explanation);
