export type Domain = 'strategy' | 'management' | 'technology';
export type Label = 'ア' | 'イ' | 'ウ' | 'エ';
export const LABELS: Label[] = ['ア', 'イ', 'ウ', 'エ'];

export const DOMAIN_NAME: Record<Domain, string> = {
  strategy: 'ストラテジ',
  management: 'マネジメント',
  technology: 'テクノロジ',
};
export const DOMAINS: Domain[] = ['strategy', 'management', 'technology'];

export type SourceType = 'IPA_OFFICIAL' | 'AI_GENERATED' | 'MANUAL' | 'OTHER';
export type ValidityStatus = 'CURRENT' | 'LEGACY_BUT_USEFUL' | 'OUTDATED' | 'REVIEW_REQUIRED';
export type ExamScope = 'CURRENT_2026' | 'NEW_SYSTEM_2027';

/** 問題（ビルド時生成・読み取り専用） */
export interface Question {
  question_id: string;
  exam_id: string;
  question_number: number;
  question_text: string;
  choices: Partial<Record<Label, string>>;
  official_answer: Label | '';
  image: string;
  has_figure: boolean;
  /** ocr=未校正（原本画像で表示） / verified=校正済み（本文で表示） */
  text_status: 'ocr' | 'verified';
  source_type: SourceType;
  source_organization: string;
  source_year: number;
  exam_name: string;
  source_url: string;
  citation: string;
  exam_scope: ExamScope;
  concept_ids: string[];
  concept_source: 'AUTO_KEYWORD' | 'CURATED';
  concept_confidence: number;
  validity_status: ValidityStatus;
  validity_notes: string[];
  recency_weight: number;
  frequency_score: number;
  domain: Domain;
  qc_flags: string[];
  // 解説（未作成なら undefined）
  short_explanation?: string;
  reason?: string;
  wrong_choice_explanations?: Partial<Record<Label, string>>;
  trap_point?: string;
  memory_tip?: string;
  detailed_explanation?: string;
  explanation_source?: 'AI_GENERATED' | 'MANUAL';
  difficulty?: number;
  modified?: boolean;
  original_text?: string;
  modification_reason?: string;
}

export interface Concept {
  concept_id: string;
  concept_name: string;
  item_name: string | null;
  domain: Domain;
  large_id: number;
  large_name: string;
  middle_id: number;
  middle_name: string;
  small_id: number;
  small_name: string;
  points: string[];
  terms: string[];
  historical_frequency: number;
  per_exam: number;
  recent_5y_frequency: number;
  recent_3y_frequency: number;
  recency_weighted_per_exam: number;
  continuity: number;
  syllabus_relevance: number;
  frequency_score: number;
  importance: 'S' | 'A' | 'B' | 'C';
  related_concepts: string[];
  first_seen_year: number | null;
  last_seen_year: number | null;
}

export type Confidence = 'sure' | 'unsure';
/** first=初見 / review=別の日の再挑戦 / repeat=短期間での同一問題の再出題（丸暗記の可能性） */
export type AttemptKind = 'first' | 'review' | 'repeat';

export type Mode = 'today' | 'quick5' | 'weak' | 'free' | 'final' | 'diagnostic' | 'mistakes';

export interface Attempt {
  id?: number;
  questionId: string;
  conceptIds: string[];
  domain: Domain;
  answeredAt: number;
  selected: Label;
  isCorrect: boolean;
  responseMs: number;
  confidence: Confidence;
  attemptNumber: number;
  kind: AttemptKind;
  sessionId: string;
  mode: Mode;
}

/** 問題単位の記憶状態（問題Mastery + SRS） */
export interface QState {
  questionId: string;
  seen: number;
  streak: number;
  lapses: number;
  incorrectCount: number;
  lastAt: number;
  lastCorrect: boolean;
  lastIncorrectAt: number | null;
  intervalDays: number;
  dueAt: number | null;
}

export type PickReason = 'weak' | 'frequent' | 'forgetting' | 'new' | 'mistake' | 'followup' | 'diagnostic' | 'free';

export const REASON_NAME: Record<PickReason, string> = {
  weak: '弱点復習',
  frequent: '頻出',
  forgetting: '忘却防止',
  new: '新しいテーマ',
  mistake: '間違いの復習',
  followup: '別の問題で確認',
  diagnostic: '診断',
  free: '演習',
};

export interface PlanItem {
  questionId: string;
  reason: PickReason;
  /** 画面に出す根拠（例: 正答率40%・本試験で平均2.1問） */
  why: string;
  conceptId?: string;
}

export interface Session {
  id: string;
  mode: Mode;
  startedAt: number;
  endedAt: number | null;
  plan: PlanItem[];
  index: number;
  title: string;
}

export interface Settings {
  examDate: string; // YYYY-MM-DD
  dailyMinutes: number;
  diagnosticDone: boolean;
  /** 効果音（既定OFF） */
  soundOn: boolean;
  /** 振動フィードバック（対応端末のみ） */
  hapticsOn: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  examDate: '2026-11-08', dailyMinutes: 20, diagnosticDone: false, soundOn: false, hapticsOn: true,
};
