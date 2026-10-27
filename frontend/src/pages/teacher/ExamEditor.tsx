import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowDown, ArrowUp, Lock, Plus, Send, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/ui/Modal";
import { ErrorState, LoadingState, Notice, PageHeader } from "@/components/ui/feedback";
import { Button, Card, CardHeader, Field, Input, Select, Textarea, Toggle } from "@/components/ui/primitives";
import { api, errorMessage } from "@/lib/api";
import { formatMinutes, fromLocalInput, plural, SECTION_LETTERS, toLocalInput } from "@/lib/format";
import type { ExamDetail, ExamSettings, Question, QuestionType } from "@/lib/types";

import { AIGenerateModal } from "./editor/AIGenerateModal";
import {
  blankQuestion,
  blankSection,
  defaultSettings,
  findProblems,
  fromExam,
  newKey,
  publishProblems,
  toPayload,
  type EditorQuestion,
  type EditorSection,
} from "./editor/model";
import { QuestionEditor } from "./editor/QuestionEditor";
import { BackLink, useClasses } from "./shared";

const MAX_SECTIONS = 4;

const ExamEditor = () => {
  const params = useParams();
  const examId = params.id ? Number(params.id) : undefined;
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const classes = useClasses();
  const config = useQuery({ queryKey: ["config"], queryFn: () => api.get<{ ai_enabled: boolean }>("/config"), staleTime: Infinity });
  const existing = useQuery({
    queryKey: ["exam", examId],
    queryFn: () => api.get<ExamDetail>(`/exams/${examId}`),
    enabled: examId !== undefined,
  });

  const [settings, setSettings] = useState<ExamSettings | null>(null);
  const [sections, setSections] = useState<EditorSection[]>([]);
  const [dirty, setDirty] = useState(false);
  const [aiSection, setAiSection] = useState<string | null>(null);
  const [removingSection, setRemovingSection] = useState<EditorSection | null>(null);
  const [showProblems, setShowProblems] = useState(false);

  // Initialise editor state once the data it depends on has loaded.
  useEffect(() => {
    if (settings) return;
    if (examId !== undefined) {
      if (!existing.data) return;
      const loaded = fromExam(existing.data);
      setSettings(loaded.settings);
      setSections(loaded.sections);
    } else if (classes.data) {
      const active = classes.data.filter((c) => !c.is_archived);
      const requested = Number(searchParams.get("classroom"));
      const classroom = active.find((c) => c.id === requested) ?? active[0];
      if (!classroom) return;
      setSettings(defaultSettings(classroom.id));
      setSections([blankSection(0)]);
    }
  }, [settings, examId, existing.data, classes.data, searchParams]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const locked = existing.data?.has_attempts ?? false;
  const published = existing.data?.is_published ?? false;
  const problems = useMemo(() => (settings ? findProblems(settings, sections) : []), [settings, sections]);
  const totals = useMemo(
    () => ({
      minutes: sections.reduce((sum, s) => sum + (s.duration_minutes || 0), 0),
      marks: sections.reduce((sum, s) => sum + s.questions.reduce((m, q) => m + q.marks, 0), 0),
      questions: sections.reduce((sum, s) => sum + s.questions.length, 0),
    }),
    [sections],
  );

  const save = useMutation({
    mutationFn: async (): Promise<ExamDetail> => {
      if (!settings) throw new Error("Nothing to save");
      if (locked) {
        const { title, instructions, available_until, max_attempts, pass_percentage } = settings;
        return api.patch<ExamDetail>(`/exams/${examId}`, { title, instructions, available_until, max_attempts, pass_percentage });
      }
      const payload = toPayload(settings, sections);
      return examId ? api.patch<ExamDetail>(`/exams/${examId}`, payload) : api.post<ExamDetail>("/exams/", payload);
    },
    onSuccess: (exam) => {
      setDirty(false);
      queryClient.setQueryData(["exam", exam.id], exam);
      void queryClient.invalidateQueries({ queryKey: ["exams"] });
      void queryClient.invalidateQueries({ queryKey: ["classes"] });
    },
  });

  const publish = useMutation({
    mutationFn: (id: number) => api.post<ExamDetail>(`/exams/${id}/publish`),
  });

  if (examId !== undefined && existing.isLoading) return <LoadingState />;
  if (existing.error) return <ErrorState error={existing.error} onRetry={() => existing.refetch()} />;
  if (classes.isLoading) return <LoadingState />;
  if (!settings) {
    return <ErrorState error={new Error("Create a class before creating an exam.")} onRetry={() => navigate("/teacher/classes")} />;
  }

  const updateSettings = (changes: Partial<ExamSettings>) => {
    setSettings({ ...settings, ...changes });
    setDirty(true);
  };
  const updateSection = (key: string, changes: Partial<EditorSection>) => {
    setSections((all) => all.map((s) => (s.key === key ? { ...s, ...changes } : s)));
    setDirty(true);
  };
  const updateQuestions = (key: string, fn: (questions: EditorQuestion[]) => EditorQuestion[]) => {
    setSections((all) => all.map((s) => (s.key === key ? { ...s, questions: fn(s.questions) } : s)));
    setDirty(true);
  };
  const moveSection = (index: number, direction: -1 | 1) => {
    setSections((all) => {
      const next = [...all];
      [next[index], next[index + direction]] = [next[index + direction], next[index]];
      return next;
    });
    setDirty(true);
  };
  const addSection = () => {
    setSections((all) => [...all, blankSection(all.length)]);
    setDirty(true);
  };

  const saveDraft = () => {
    if (problems.length) {
      setShowProblems(true);
      toast.error("Fix the highlighted problems first.");
      return;
    }
    save.mutate(undefined, {
      onSuccess: (exam) => {
        toast.success("Saved");
        if (!examId) navigate(`/teacher/exams/${exam.id}/edit`, { replace: true });
      },
      onError: (error) => toast.error(errorMessage(error)),
    });
  };

  const saveAndPublish = () => {
    const blocking = [...problems, ...publishProblems(sections)];
    if (blocking.length) {
      setShowProblems(true);
      toast.error(blocking[0]);
      return;
    }
    save.mutate(undefined, {
      onSuccess: (exam) =>
        publish.mutate(exam.id, {
          onSuccess: () => {
            toast.success("Published. Students in the class can now see it.");
            void queryClient.invalidateQueries({ queryKey: ["exams"] });
            navigate(`/teacher/exams/${exam.id}`);
          },
          onError: (error) => {
            toast.error(errorMessage(error));
            if (!examId) navigate(`/teacher/exams/${exam.id}/edit`, { replace: true });
          },
        }),
      onError: (error) => toast.error(errorMessage(error)),
    });
  };

  const activeClasses = (classes.data ?? []).filter((c) => !c.is_archived || c.id === settings.classroom);
  const aiTarget = sections.find((s) => s.key === aiSection);
  const busy = save.isPending || publish.isPending;

  return (
    <div className="pb-28">
      <PageHeader
        back={<BackLink to={examId ? `/teacher/exams/${examId}` : "/teacher/exams"} label={examId ? "Back to exam" : "Exams"} />}
        title={examId ? "Edit exam" : "New exam"}
        description={published ? "This exam is published. Changes apply to students immediately." : "Drafts are invisible to students."}
      />

      {locked && (
        <Notice tone="warning" icon={Lock} title="Students have started this exam" className="mb-6">
          To keep results fair, questions, sections and timing rules are locked. You can still change the title, instructions, closing
          time, attempt limit and pass mark.
        </Notice>
      )}

      {showProblems && problems.length > 0 && (
        <Notice tone="danger" icon={AlertTriangle} title="Fix these before saving" className="mb-6">
          <ul className="list-disc space-y-0.5 pl-4">
            {problems.slice(0, 8).map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
            {problems.length > 8 && <li>…and {problems.length - 8} more</li>}
          </ul>
        </Notice>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Paper details" />
            <div className="space-y-4 p-4 sm:p-5">
              <Field label="Title">
                {(id) => <Input id={id} value={settings.title} onChange={(e) => updateSettings({ title: e.target.value })} placeholder="e.g. Midterm — Compiler Construction" />}
              </Field>
              <Field label="Class">
                {(id) => (
                  <Select id={id} value={settings.classroom} onChange={(e) => updateSettings({ classroom: Number(e.target.value) })} disabled={locked}>
                    {activeClasses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label="Instructions for students (optional)">
                {(id) => (
                  <Textarea
                    id={id}
                    value={settings.instructions}
                    onChange={(e) => updateSettings({ instructions: e.target.value })}
                    rows={3}
                    placeholder="e.g. Attempt all questions. Calculators are not allowed."
                  />
                )}
              </Field>
            </div>
          </Card>

          {sections.map((section, index) => (
            <Card key={section.key}>
              <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3 sm:px-5">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary-soft text-sm font-bold text-primary">
                  {SECTION_LETTERS[index]}
                </span>
                <Input
                  value={section.title}
                  onChange={(e) => updateSection(section.key, { title: e.target.value })}
                  className="h-9 min-w-0 flex-1 font-semibold sm:max-w-xs"
                  disabled={locked}
                  aria-label="Section title"
                />
                <label className="flex items-center gap-1.5 text-sm text-muted">
                  <Input
                    type="number"
                    min={1}
                    max={600}
                    value={section.duration_minutes}
                    onChange={(e) => updateSection(section.key, { duration_minutes: Math.max(0, Math.min(600, Number(e.target.value) || 0)) })}
                    className="h-9 w-20 text-center"
                    disabled={locked}
                    aria-label="Section time in minutes"
                  />
                  min
                </label>
                {!locked && sections.length > 1 && (
                  <div className="ml-auto flex">
                    <Button size="icon" variant="ghost" className="h-9 w-9" onClick={() => moveSection(index, -1)} disabled={index === 0} aria-label="Move section up">
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-9 w-9" onClick={() => moveSection(index, 1)} disabled={index === sections.length - 1} aria-label="Move section down">
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-9 w-9 text-danger" onClick={() => setRemovingSection(section)} aria-label="Delete section">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
              <div className="space-y-3 p-4 sm:p-5">
                <Textarea
                  value={section.instructions}
                  onChange={(e) => updateSection(section.key, { instructions: e.target.value })}
                  rows={1}
                  placeholder="Section instructions (optional), e.g. Attempt any 3"
                  className="min-h-[40px]"
                  disabled={locked}
                  aria-label="Section instructions"
                />
                {section.questions.map((question, qIndex) => (
                  <QuestionEditor
                    key={question.key}
                    question={question}
                    number={qIndex + 1}
                    locked={locked}
                    isFirst={qIndex === 0}
                    isLast={qIndex === section.questions.length - 1}
                    onChange={(changed) => updateQuestions(section.key, (qs) => qs.map((q) => (q.key === changed.key ? changed : q)))}
                    onMove={(direction) =>
                      updateQuestions(section.key, (qs) => {
                        const next = [...qs];
                        [next[qIndex], next[qIndex + direction]] = [next[qIndex + direction], next[qIndex]];
                        return next;
                      })
                    }
                    onDuplicate={() =>
                      updateQuestions(section.key, (qs) => [...qs.slice(0, qIndex + 1), { ...question, id: undefined, key: newKey() }, ...qs.slice(qIndex + 1)])
                    }
                    onRemove={() => updateQuestions(section.key, (qs) => qs.filter((q) => q.key !== question.key))}
                  />
                ))}
                {section.questions.length === 0 && (
                  <p className="rounded-xl border border-dashed border-border py-6 text-center text-sm text-muted">No questions in this section yet.</p>
                )}
                {!locked && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {(["mcq", "short", "long"] as QuestionType[]).map((type) => (
                      <Button key={type} size="sm" variant="secondary" onClick={() => updateQuestions(section.key, (qs) => [...qs, blankQuestion(type)])}>
                        <Plus className="h-4 w-4" /> {type === "mcq" ? "MCQ" : type === "short" ? "Short" : "Long"}
                      </Button>
                    ))}
                    {config.data?.ai_enabled && (
                      <Button size="sm" variant="ghost" className="text-primary" onClick={() => setAiSection(section.key)}>
                        <Sparkles className="h-4 w-4" /> Generate with AI
                      </Button>
                    )}
                  </div>
                )}
                <p className="text-right text-xs text-muted">
                  {plural(section.questions.length, "question")} · {section.questions.reduce((m, q) => m + q.marks, 0)} marks
                </p>
              </div>
            </Card>
          ))}

          {!locked && sections.length < MAX_SECTIONS && (
            <Button variant="secondary" className="w-full border-dashed" onClick={addSection}>
              <Plus className="h-4 w-4" /> Add section {SECTION_LETTERS[sections.length]}
            </Button>
          )}
        </div>

        <div className="space-y-6 lg:sticky lg:top-24">
          <Card>
            <CardHeader title="Availability" />
            <div className="space-y-4 p-4 sm:p-5">
              <Field label="Opens" hint="Leave empty to open as soon as you publish.">
                {(id) => (
                  <Input
                    id={id}
                    type="datetime-local"
                    value={toLocalInput(settings.available_from)}
                    onChange={(e) => updateSettings({ available_from: fromLocalInput(e.target.value) })}
                    disabled={locked}
                  />
                )}
              </Field>
              <Field label="Closes" hint="Students can't start after this. Anyone mid-exam is cut off at this time.">
                {(id) => (
                  <Input id={id} type="datetime-local" value={toLocalInput(settings.available_until)} onChange={(e) => updateSettings({ available_until: fromLocalInput(e.target.value) })} />
                )}
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Attempts allowed">
                  {(id) => (
                    <Input id={id} type="number" min={1} max={10} value={settings.max_attempts} onChange={(e) => updateSettings({ max_attempts: Math.max(1, Math.min(10, Number(e.target.value) || 1)) })} />
                  )}
                </Field>
                <Field label="Pass mark %">
                  {(id) => (
                    <Input id={id} type="number" min={0} max={100} value={settings.pass_percentage} onChange={(e) => updateSettings({ pass_percentage: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })} />
                  )}
                </Field>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Rules" />
            <div className="space-y-4 p-4 sm:p-5">
              <Toggle
                checked={settings.allow_modular}
                onChange={(allow_modular) => updateSettings({ allow_modular })}
                label="Allow section-by-section"
                description={sections.length > 1 ? "Students may do one section at a time, with breaks in between." : "Needs 2 or more sections."}
                disabled={locked}
              />
              <Field label="When time runs out">
                {(id) => (
                  <Select
                    id={id}
                    value={settings.overtime_policy}
                    onChange={(e) => {
                      const policy = e.target.value as ExamSettings["overtime_policy"];
                      updateSettings({ overtime_policy: policy, grace_minutes: policy === "grace" ? settings.grace_minutes || 10 : 0 });
                    }}
                    disabled={locked}
                  >
                    <option value="hard_lock">Lock and auto-submit</option>
                    <option value="grace">Allow a grace period (marked overtime)</option>
                  </Select>
                )}
              </Field>
              {settings.overtime_policy === "grace" && (
                <Field label="Grace period (minutes)">
                  {(id) => (
                    <Input id={id} type="number" min={1} max={120} value={settings.grace_minutes} onChange={(e) => updateSettings({ grace_minutes: Math.max(0, Math.min(120, Number(e.target.value) || 0)) })} disabled={locked} />
                  )}
                </Field>
              )}
              <Toggle checked={settings.shuffle_questions} onChange={(shuffle_questions) => updateSettings({ shuffle_questions })} label="Shuffle question order" description="Each student gets a different order." disabled={locked} />
              <Toggle checked={settings.shuffle_options} onChange={(shuffle_options) => updateSettings({ shuffle_options })} label="Shuffle MCQ options" disabled={locked} />
            </div>
          </Card>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface/95 backdrop-blur lg:left-64">
        <div className="safe-bottom mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 pt-3 sm:px-6 sm:pb-3">
          <p className="tabular text-sm text-muted">
            <span className="font-semibold text-fg">{totals.questions}</span> questions · <span className="font-semibold text-fg">{totals.marks}</span> marks ·{" "}
            <span className="font-semibold text-fg">{formatMinutes(totals.minutes)}</span>
            {dirty && <span className="ml-2 text-warning">· unsaved</span>}
          </p>
          <div className="flex flex-1 gap-2 sm:flex-none">
            <Button variant="secondary" className="flex-1 sm:flex-none" onClick={saveDraft} loading={save.isPending && !publish.isPending} disabled={busy}>
              {published ? "Save changes" : "Save draft"}
            </Button>
            {!published && (
              <Button className="flex-1 sm:flex-none" onClick={saveAndPublish} loading={publish.isPending} disabled={busy}>
                <Send className="h-4 w-4" /> Publish
              </Button>
            )}
          </div>
        </div>
      </div>

      {aiTarget && (
        <AIGenerateModal
          open
          onOpenChange={(open) => !open && setAiSection(null)}
          sectionTitle={aiTarget.title}
          onAdd={(questions: Question[], suggestedTitle) => {
            updateQuestions(aiTarget.key, (qs) => [...qs, ...questions.map((q) => ({ ...q, key: newKey() }))]);
            if (!settings.title.trim()) updateSettings({ title: suggestedTitle });
          }}
        />
      )}
      <ConfirmDialog
        open={removingSection !== null}
        onOpenChange={(open) => !open && setRemovingSection(null)}
        title={`Delete ${removingSection?.title ?? "section"}?`}
        description={`Its ${plural(removingSection?.questions.length ?? 0, "question")} will be removed too.`}
        confirmLabel="Delete section"
        danger
        onConfirm={() => {
          if (!removingSection) return;
          setSections((all) => all.filter((s) => s.key !== removingSection.key));
          setDirty(true);
        }}
      />
    </div>
  );
};

export default ExamEditor;
