import { ArrowDown, ArrowUp, Check, Copy, Plus, Trash2, X } from "lucide-react";

import { Badge, Button, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { cn, QUESTION_TYPE_LABEL } from "@/lib/format";
import type { QuestionType } from "@/lib/types";

import { DEFAULT_MARKS, type EditorQuestion } from "./model";

type Props = {
  question: EditorQuestion;
  number: number;
  locked: boolean;
  isFirst: boolean;
  isLast: boolean;
  onChange: (question: EditorQuestion) => void;
  onMove: (direction: -1 | 1) => void;
  onDuplicate: () => void;
  onRemove: () => void;
};

const OPTION_LETTERS = "ABCDEF";

export const QuestionEditor = ({ question, number, locked, isFirst, isLast, onChange, onMove, onDuplicate, onRemove }: Props) => {
  const set = (changes: Partial<EditorQuestion>) => onChange({ ...question, ...changes });

  const changeType = (type: QuestionType) => {
    if (type === question.type) return;
    const keepMarks = question.marks !== DEFAULT_MARKS[question.type];
    set({
      type,
      options: type === "mcq" ? (question.options.length ? question.options : ["", "", "", ""]) : [],
      correct_option: type === "mcq" ? question.correct_option : null,
      marks: keepMarks ? question.marks : DEFAULT_MARKS[type],
    });
  };

  const setOption = (index: number, value: string) => set({ options: question.options.map((o, i) => (i === index ? value : o)) });

  const removeOption = (index: number) => {
    const correct = question.correct_option;
    set({
      options: question.options.filter((_, i) => i !== index),
      correct_option: correct === null || correct === index ? null : correct > index ? correct - 1 : correct,
    });
  };

  return (
    <div className="rounded-xl border border-border bg-bg/40 p-3 sm:p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="grid h-7 min-w-7 place-items-center rounded-md bg-subtle px-1.5 text-xs font-bold">Q{number}</span>
        {locked ? (
          <Badge>{QUESTION_TYPE_LABEL[question.type]}</Badge>
        ) : (
          <Select value={question.type} onChange={(e) => changeType(e.target.value as QuestionType)} className="h-8 w-auto text-sm" aria-label="Question type">
            <option value="mcq">MCQ</option>
            <option value="short">Short answer</option>
            <option value="long">Long answer</option>
          </Select>
        )}
        <label className="flex items-center gap-1.5 text-sm text-muted">
          <Input
            type="number"
            min={1}
            max={100}
            value={question.marks}
            onChange={(e) => set({ marks: Math.max(1, Math.min(100, Number(e.target.value) || 1)) })}
            className="h-8 w-16 text-center"
            disabled={locked}
            aria-label="Marks"
          />
          marks
        </label>
        {!locked && (
          <div className="ml-auto flex items-center">
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => onMove(-1)} disabled={isFirst} aria-label="Move up">
              <ArrowUp className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => onMove(1)} disabled={isLast} aria-label="Move down">
              <ArrowDown className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onDuplicate} aria-label="Duplicate question">
              <Copy className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="ghost" className="h-8 w-8 text-danger" onClick={onRemove} aria-label="Delete question">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      <Textarea
        value={question.text}
        onChange={(e) => set({ text: e.target.value })}
        placeholder="Type the question…"
        rows={2}
        disabled={locked}
        aria-label={`Question ${number} text`}
        className="min-h-[64px]"
      />

      {question.type === "mcq" ? (
        <div className="mt-3 space-y-2">
          <p className="text-xs text-muted">Tap the circle next to the correct answer.</p>
          {question.options.map((option, index) => {
            const correct = question.correct_option === index;
            return (
              <div key={index} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => set({ correct_option: index })}
                  disabled={locked}
                  className={cn(
                    "grid h-8 w-8 shrink-0 place-items-center rounded-full border text-xs font-semibold transition-colors",
                    correct ? "border-success bg-success text-white dark:text-bg" : "border-border text-muted hover:border-success",
                  )}
                  aria-label={`Mark option ${OPTION_LETTERS[index]} as correct`}
                  aria-pressed={correct}
                >
                  {correct ? <Check className="h-4 w-4" /> : OPTION_LETTERS[index]}
                </button>
                <Input
                  value={option}
                  onChange={(e) => setOption(index, e.target.value)}
                  placeholder={`Option ${OPTION_LETTERS[index]}`}
                  disabled={locked}
                  className={cn(correct && "border-success/60")}
                  aria-label={`Option ${OPTION_LETTERS[index]}`}
                />
                {!locked && question.options.length > 2 && (
                  <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => removeOption(index)} aria-label={`Remove option ${OPTION_LETTERS[index]}`}>
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            );
          })}
          {!locked && question.options.length < 6 && (
            <Button size="sm" variant="ghost" onClick={() => set({ options: [...question.options, ""] })}>
              <Plus className="h-4 w-4" /> Add option
            </Button>
          )}
        </div>
      ) : (
        <Field label="Marking guidelines" hint="What a full-marks answer must include. Used by you and the AI when grading." className="mt-3">
          {(id) => (
            <Textarea
              id={id}
              value={question.marking_guidelines}
              onChange={(e) => set({ marking_guidelines: e.target.value })}
              rows={2}
              disabled={locked}
              placeholder="e.g. Defines encapsulation (2), gives an example (2), mentions access modifiers (1)"
              className="min-h-[64px]"
            />
          )}
        </Field>
      )}
    </div>
  );
};
