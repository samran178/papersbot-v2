import { useMutation } from "@tanstack/react-query";
import { FileUp, Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Modal } from "@/components/ui/Modal";
import { Notice } from "@/components/ui/feedback";
import { Badge, Button, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { api, errorMessage } from "@/lib/api";
import { cn, plural, QUESTION_TYPE_LABEL } from "@/lib/format";
import type { GeneratedQuestions, Question } from "@/lib/types";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sectionTitle: string;
  onAdd: (questions: Question[], suggestedTitle: string) => void;
};

const COUNT_FIELDS = [
  { key: "num_mcq", marksKey: "marks_mcq", label: "MCQs", max: 50 },
  { key: "num_short", marksKey: "marks_short", label: "Short", max: 30 },
  { key: "num_long", marksKey: "marks_long", label: "Long", max: 10 },
] as const;

export const AIGenerateModal = ({ open, onOpenChange, sectionTitle, onAdd }: Props) => {
  const [source, setSource] = useState<"text" | "pdf">("text");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [counts, setCounts] = useState({ num_mcq: 5, num_short: 2, num_long: 1, marks_mcq: 1, marks_short: 5, marks_long: 10 });
  const [difficulty, setDifficulty] = useState("medium");
  const [focus, setFocus] = useState("");
  const [result, setResult] = useState<GeneratedQuestions | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());

  const generate = useMutation({
    mutationFn: () => {
      const form = new FormData();
      Object.entries(counts).forEach(([key, value]) => form.append(key, String(value)));
      form.append("difficulty", difficulty);
      form.append("focus", focus);
      if (source === "pdf" && file) form.append("file", file);
      else form.append("text", text);
      return api.post<GeneratedQuestions>("/ai/generate-questions", form);
    },
    onSuccess: (data) => {
      setResult(data);
      setPicked(new Set(data.questions.map((_, i) => i)));
      if (data.questions.length < data.requested) toast.info(`Got ${data.questions.length} of ${data.requested} questions; some were unusable.`);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const close = (next: boolean) => {
    onOpenChange(next);
    if (!next) {
      setResult(null);
      generate.reset();
    }
  };

  const add = () => {
    if (!result) return;
    onAdd(result.questions.filter((_, i) => picked.has(i)), result.title);
    toast.success(`${picked.size} questions added to ${sectionTitle}. Review them before publishing.`);
    close(false);
  };

  const canGenerate = (source === "text" ? text.trim().length >= 50 : file !== null) && counts.num_mcq + counts.num_short + counts.num_long > 0;

  return (
    <Modal
      open={open}
      onOpenChange={close}
      size="lg"
      locked={generate.isPending}
      title={result ? "Pick the questions to keep" : "Generate questions with AI"}
      description={result ? `They will be added to ${sectionTitle}. You can edit them afterwards.` : "Paste lecture notes or upload a text-based PDF."}
      footer={
        result ? (
          <>
            <Button variant="secondary" onClick={() => setResult(null)}>
              Back
            </Button>
            <Button onClick={add} disabled={picked.size === 0}>
              Add {picked.size} questions
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={() => close(false)} disabled={generate.isPending}>
              Cancel
            </Button>
            <Button onClick={() => generate.mutate()} loading={generate.isPending} disabled={!canGenerate}>
              <Sparkles className="h-4 w-4" /> {generate.isPending ? "Generating… (up to a minute)" : "Generate"}
            </Button>
          </>
        )
      }
    >
      {result ? (
        <ul className="space-y-2">
          {result.questions.map((question, index) => {
            const on = picked.has(index);
            return (
              <li key={index}>
                <label className={cn("flex cursor-pointer gap-3 rounded-xl border p-3", on ? "border-primary bg-primary-soft/40" : "border-border")}>
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 accent-primary"
                    checked={on}
                    onChange={() => {
                      const next = new Set(picked);
                      if (on) next.delete(index);
                      else next.add(index);
                      setPicked(next);
                    }}
                  />
                  <span className="min-w-0 space-y-1">
                    <span className="flex gap-2">
                      <Badge>{QUESTION_TYPE_LABEL[question.type]}</Badge>
                      <Badge tone="primary">{plural(question.marks, "mark")}</Badge>
                    </span>
                    <span className="block text-sm">{question.text}</span>
                    {question.type === "mcq" && (
                      <span className="block text-xs text-muted">
                        {question.options.map((o, i) => (
                          <span key={i} className={cn("mr-3 inline-block", i === question.correct_option && "font-semibold text-success")}>
                            {"ABCDEF"[i]}. {o}
                          </span>
                        ))}
                      </span>
                    )}
                    {question.marking_guidelines && <span className="block text-xs text-muted">Guidelines: {question.marking_guidelines}</span>}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-subtle p-1" role="tablist">
            {(["text", "pdf"] as const).map((value) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={source === value}
                onClick={() => setSource(value)}
                className={cn("rounded-md py-1.5 text-sm font-medium", source === value ? "bg-surface shadow-sm" : "text-muted")}
              >
                {value === "text" ? "Paste text" : "Upload PDF"}
              </button>
            ))}
          </div>

          {source === "text" ? (
            <Field label="Course material" hint={`${text.length.toLocaleString()} characters · at least a paragraph`}>
              {(id) => <Textarea id={id} value={text} onChange={(e) => setText(e.target.value)} rows={8} placeholder="Paste lecture notes, a chapter, or slides text here…" />}
            </Field>
          ) : (
            <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-border px-4 py-8 text-center hover:bg-subtle">
              <FileUp className="h-6 w-6 text-muted" aria-hidden />
              <span className="text-sm font-medium">{file ? file.name : "Choose a PDF (max 10 MB)"}</span>
              <span className="text-xs text-muted">Scanned pages won't work: the PDF needs selectable text.</span>
              <input type="file" accept="application/pdf,.pdf" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </label>
          )}

          <div className="grid grid-cols-3 gap-3">
            {COUNT_FIELDS.map(({ key, marksKey, label, max }) => (
              <div key={key} className="space-y-1.5 rounded-xl border border-border p-3">
                <p className="text-sm font-medium">{label}</p>
                <Input
                  type="number"
                  min={0}
                  max={max}
                  value={counts[key]}
                  onChange={(e) => setCounts({ ...counts, [key]: Math.max(0, Math.min(max, Number(e.target.value) || 0)) })}
                  aria-label={`Number of ${label} questions`}
                />
                <label className="flex items-center gap-1 text-xs text-muted">
                  <Input
                    type="number"
                    min={1}
                    max={100}
                    value={counts[marksKey]}
                    onChange={(e) => setCounts({ ...counts, [marksKey]: Math.max(1, Math.min(100, Number(e.target.value) || 1)) })}
                    className="h-7 w-12 px-1 text-center text-xs"
                    aria-label={`Marks per ${label} question`}
                  />
                  marks each
                </label>
              </div>
            ))}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Difficulty">
              {(id) => (
                <Select id={id} value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </Select>
              )}
            </Field>
            <Field label="Focus on (optional)">
              {(id) => <Input id={id} value={focus} onChange={(e) => setFocus(e.target.value)} placeholder="e.g. LR parsing, not lexing" />}
            </Field>
          </div>
          <Notice tone="warning">AI can be wrong. Check every question and correct answer before publishing.</Notice>
        </div>
      )}
    </Modal>
  );
};
