import { useCallback, useEffect, useRef, useState } from "react";

import { api, ApiError } from "@/lib/api";
import type { IntegrityKind, LiveAttempt, LiveQuestion } from "@/lib/types";

export type AnswerValue = { selected_option?: number | null; text_answer?: string };
export type SaveState = "saved" | "saving" | "unsaved" | "offline";

const AUTOSAVE_DELAY_MS = 1200;
const RETRY_DELAY_MS = 5000;

/** Ticks every second using the server's clock, corrected for this device's drift. */
export const useServerNow = (serverNowIso: string | undefined, receivedAt: number) => {
  const offset = serverNowIso ? Date.parse(serverNowIso) - receivedAt : 0;
  const [now, setNow] = useState(() => Date.now() + offset);
  useEffect(() => {
    setNow(Date.now() + offset);
    const timer = setInterval(() => setNow(Date.now() + offset), 1000);
    return () => clearInterval(timer);
  }, [offset]);
  return now;
};

const draftKey = (attemptId: number) => `papersbot-draft-${attemptId}`;

const readDrafts = (attemptId: number): Record<number, AnswerValue> => {
  try {
    return JSON.parse(localStorage.getItem(draftKey(attemptId)) ?? "{}");
  } catch {
    return {};
  }
};

const writeDrafts = (attemptId: number, drafts: Record<number, AnswerValue>) => {
  try {
    localStorage.setItem(draftKey(attemptId), JSON.stringify(drafts));
  } catch {
    // storage full or blocked: the server copy is still the source of truth
  }
};

export const clearDrafts = (attemptId: number) => {
  try {
    localStorage.removeItem(draftKey(attemptId));
  } catch {
    // ignore
  }
};

const serverValue = (question: LiveQuestion): AnswerValue =>
  question.type === "mcq" ? { selected_option: question.selected_option } : { text_answer: question.text_answer };

const sameValue = (a: AnswerValue, b: AnswerValue) => a.selected_option === b.selected_option && (a.text_answer ?? "") === (b.text_answer ?? "");

/**
 * Local answers with debounced autosave. Unsaved answers are also kept in
 * localStorage so a refresh or dropped connection doesn't lose typing.
 */
export const useAnswers = (attempt: LiveAttempt | undefined, onConflict: () => void) => {
  const attemptId = attempt?.id;
  const [answers, setAnswers] = useState<Record<number, AnswerValue>>({});
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const dirty = useRef(new Set<number>());
  const answersRef = useRef(answers);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const inFlight = useRef<Promise<void> | null>(null);
  answersRef.current = answers;

  // Merge questions from the server without clobbering anything typed locally.
  useEffect(() => {
    if (!attempt) return;
    const drafts = readDrafts(attempt.id);
    setAnswers((current) => {
      const next = { ...current };
      for (const section of attempt.sections) {
        for (const question of section.questions ?? []) {
          if (question.id in next) continue;
          const draft = drafts[question.id];
          const fromServer = serverValue(question);
          if (draft && !sameValue(draft, fromServer)) {
            next[question.id] = draft;
            dirty.current.add(question.id);
          } else {
            next[question.id] = fromServer;
          }
        }
      }
      return next;
    });
  }, [attempt]);

  const flush = useCallback(async (): Promise<void> => {
    if (attemptId === undefined) return;
    if (inFlight.current) await inFlight.current;
    if (dirty.current.size === 0) return;

    const ids = [...dirty.current];
    dirty.current.clear();
    const payload = ids.map((question_id) => ({ question_id, ...answersRef.current[question_id] }));
    setSaveState("saving");

    const run = api
      .post(`/attempts/${attemptId}/answers`, { answers: payload })
      .then(() => {
        setSaveState(dirty.current.size ? "unsaved" : "saved");
        const drafts = readDrafts(attemptId);
        ids.forEach((id) => {
          if (!dirty.current.has(id)) delete drafts[id];
        });
        writeDrafts(attemptId, drafts);
      })
      .catch((error: unknown) => {
        ids.forEach((id) => dirty.current.add(id));
        if (error instanceof ApiError && error.status === 409) {
          onConflict();
          return;
        }
        setSaveState("offline");
        clearTimeout(timer.current);
        timer.current = setTimeout(() => void flush(), RETRY_DELAY_MS);
      })
      .finally(() => {
        inFlight.current = null;
      });
    inFlight.current = run;
    return run;
  }, [attemptId, onConflict]);

  const setAnswer = useCallback(
    (questionId: number, value: AnswerValue) => {
      setAnswers((current) => ({ ...current, [questionId]: { ...current[questionId], ...value } }));
      dirty.current.add(questionId);
      setSaveState("unsaved");
      if (attemptId !== undefined) {
        const drafts = readDrafts(attemptId);
        drafts[questionId] = { ...answersRef.current[questionId], ...value };
        writeDrafts(attemptId, drafts);
      }
      clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), AUTOSAVE_DELAY_MS);
    },
    [attemptId, flush],
  );

  // Save immediately when the tab is hidden (phone locked, app switched).
  useEffect(() => {
    const onHide = () => document.visibilityState === "hidden" && void flush();
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [flush]);

  useEffect(() => () => clearTimeout(timer.current), []);

  /** Every answer for the given questions, for the final submit. */
  const collect = useCallback(
    (questionIds: number[]) => questionIds.map((question_id) => ({ question_id, ...answersRef.current[question_id] })),
    [],
  );

  const markAllSaved = useCallback(() => {
    clearTimeout(timer.current);
    dirty.current.clear();
    setSaveState("saved");
  }, []);

  return { answers, setAnswer, saveState, flush, collect, markAllSaved };
};

const EVENT_THROTTLE_MS = 3000;

/** Reports tab switches, copy/paste and similar to the server. Returns a count for the on-screen warning. */
export const useIntegrityMonitor = (attemptId: number | undefined, active: boolean) => {
  const [warnings, setWarnings] = useState(0);
  const lastSent = useRef<Partial<Record<IntegrityKind, number>>>({});

  const report = useCallback(
    (kind: IntegrityKind) => {
      if (attemptId === undefined) return;
      const now = Date.now();
      if (now - (lastSent.current[kind] ?? 0) < EVENT_THROTTLE_MS) return;
      lastSent.current[kind] = now;
      setWarnings((n) => n + 1);
      void api.post(`/attempts/${attemptId}/events`, { kind }).catch(() => undefined);
    },
    [attemptId],
  );

  useEffect(() => {
    if (!active) return;
    let wasFullscreen = Boolean(document.fullscreenElement);
    // A reload or closing the tab also hides the page; that isn't switching away mid-exam.
    let leaving = false;
    let leavingTimer: ReturnType<typeof setTimeout> | undefined;
    const onBeforeUnload = () => {
      leaving = true;
      clearTimeout(leavingTimer);
      leavingTimer = setTimeout(() => (leaving = false), 1000); // runs only if the student cancelled leaving
    };

    const onVisibility = () => document.visibilityState === "hidden" && !leaving && report("tab_hidden");
    const onBlur = () => !document.hidden && !leaving && report("window_blur");
    const block = (kind: IntegrityKind) => (event: Event) => {
      event.preventDefault();
      report(kind);
    };
    const onCopy = block("copy");
    const onPaste = block("paste");
    const onContextMenu = block("context_menu");
    const onFullscreen = () => {
      if (wasFullscreen && !document.fullscreenElement) report("fullscreen_exit");
      wasFullscreen = Boolean(document.fullscreenElement);
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    document.addEventListener("copy", onCopy);
    document.addEventListener("cut", onCopy);
    document.addEventListener("paste", onPaste);
    document.addEventListener("contextmenu", onContextMenu);
    document.addEventListener("fullscreenchange", onFullscreen);
    return () => {
      clearTimeout(leavingTimer);
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("cut", onCopy);
      document.removeEventListener("paste", onPaste);
      document.removeEventListener("contextmenu", onContextMenu);
      document.removeEventListener("fullscreenchange", onFullscreen);
    };
  }, [active, report]);

  return warnings;
};
