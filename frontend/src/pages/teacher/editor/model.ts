import { addDays, setHours, setMinutes } from "date-fns";

import { SECTION_LETTERS } from "@/lib/format";
import type { ExamDetail, ExamSettings, Question, QuestionType, Section } from "@/lib/types";

/** Editor state carries a client-only `key` so React can track rows that have no id yet. */
export type EditorQuestion = Question & { key: string };
export type EditorSection = Omit<Section, "questions"> & { key: string; questions: EditorQuestion[] };

let counter = 0;
export const newKey = () => `k${Date.now().toString(36)}${(counter++).toString(36)}`;

export const DEFAULT_MARKS: Record<QuestionType, number> = { mcq: 1, short: 5, long: 10 };

export const blankQuestion = (type: QuestionType): EditorQuestion => ({
  key: newKey(),
  type,
  text: "",
  options: type === "mcq" ? ["", "", "", ""] : [],
  correct_option: null,
  marks: DEFAULT_MARKS[type],
  marking_guidelines: "",
});

export const blankSection = (index: number): EditorSection => ({
  key: newKey(),
  title: `Section ${SECTION_LETTERS[index] ?? index + 1}`,
  instructions: "",
  duration_minutes: 30,
  questions: [],
});

export const defaultSettings = (classroom: number): ExamSettings => ({
  classroom,
  title: "",
  instructions: "",
  available_from: null,
  available_until: setMinutes(setHours(addDays(new Date(), 3), 23), 59).toISOString(),
  max_attempts: 1,
  allow_modular: true,
  overtime_policy: "hard_lock",
  grace_minutes: 0,
  shuffle_questions: false,
  shuffle_options: false,
  pass_percentage: 50,
});

export const fromExam = (exam: ExamDetail): { settings: ExamSettings; sections: EditorSection[] } => ({
  settings: {
    classroom: exam.classroom.id,
    title: exam.title,
    instructions: exam.instructions,
    available_from: exam.available_from,
    available_until: exam.available_until,
    max_attempts: exam.max_attempts,
    allow_modular: exam.allow_modular,
    overtime_policy: exam.overtime_policy,
    grace_minutes: exam.grace_minutes,
    shuffle_questions: exam.shuffle_questions,
    shuffle_options: exam.shuffle_options,
    pass_percentage: exam.pass_percentage,
  },
  sections: exam.sections.map((section) => ({
    ...section,
    key: newKey(),
    questions: section.questions.map((question) => ({ ...question, key: newKey() })),
  })),
});

export const toPayload = (settings: ExamSettings, sections: EditorSection[]) => ({
  ...settings,
  sections: sections.map(({ title, instructions, duration_minutes, questions }) => ({
    title,
    instructions,
    duration_minutes,
    questions: questions.map(({ type, text, options, correct_option, marks, marking_guidelines }) => ({
      type,
      text,
      options: type === "mcq" ? options : [],
      correct_option: type === "mcq" ? correct_option : null,
      marks,
      marking_guidelines: type === "mcq" ? "" : marking_guidelines,
    })),
  })),
});

/** Problems that block saving, in the teacher's language. Server re-checks everything. */
export const findProblems = (settings: ExamSettings, sections: EditorSection[]): string[] => {
  const problems: string[] = [];
  if (!settings.title.trim()) problems.push("Give the exam a title.");
  if (!settings.available_until) problems.push("Set when the exam closes.");
  if (settings.available_from && settings.available_until && new Date(settings.available_from) >= new Date(settings.available_until))
    problems.push("The closing time must be after the opening time.");
  if (settings.overtime_policy === "grace" && !settings.grace_minutes) problems.push("Set the grace period in minutes.");

  sections.forEach((section) => {
    if (!section.title.trim()) problems.push("Every section needs a title.");
    if (!section.duration_minutes || section.duration_minutes < 1) problems.push(`${section.title || "A section"} needs a time limit.`);
    section.questions.forEach((question, index) => {
      const label = `${section.title} Q${index + 1}`;
      if (!question.text.trim()) problems.push(`${label} has no question text.`);
      if (question.type === "mcq") {
        const options = question.options.map((o) => o.trim());
        if (options.length < 2) problems.push(`${label} needs at least 2 options.`);
        if (options.some((o) => !o)) problems.push(`${label} has an empty option.`);
        if (new Set(options.map((o) => o.toLowerCase())).size !== options.length) problems.push(`${label} has duplicate options.`);
        if (question.correct_option === null) problems.push(`${label}: mark the correct option.`);
      }
    });
  });
  return [...new Set(problems)];
};

export const publishProblems = (sections: EditorSection[]): string[] =>
  sections.filter((s) => s.questions.length === 0).map((s) => `${s.title} has no questions.`);
