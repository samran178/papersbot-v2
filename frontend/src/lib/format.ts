import { clsx, type ClassValue } from "clsx";
import { differenceInMinutes, format, formatDistanceToNowStrict, isPast } from "date-fns";
import { twMerge } from "tailwind-merge";

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

export const formatDateTime = (iso: string | null | undefined) => (iso ? format(new Date(iso), "d MMM yyyy, h:mm a") : "—");

export const formatDate = (iso: string | null | undefined) => (iso ? format(new Date(iso), "d MMM yyyy") : "—");

export const relative = (iso: string) => {
  const date = new Date(iso);
  const distance = formatDistanceToNowStrict(date);
  return isPast(date) ? `${distance} ago` : `in ${distance}`;
};

export const minutesUntil = (iso: string) => differenceInMinutes(new Date(iso), new Date());

export const formatMinutes = (minutes: number) => {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
};

export const formatSeconds = (totalSeconds: number) => {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
};

export const formatDuration = (totalSeconds: number) => {
  const minutes = Math.round(totalSeconds / 60);
  if (minutes < 1) return `${Math.max(0, Math.round(totalSeconds))} sec`;
  return formatMinutes(minutes);
};

export const formatMarks = (value: number | null | undefined) =>
  value === null || value === undefined ? "—" : Number.isInteger(value) ? String(value) : value.toFixed(1);

/** <input type="datetime-local"> works in local time without a zone. */
export const toLocalInput = (iso: string | null | undefined) => (iso ? format(new Date(iso), "yyyy-MM-dd'T'HH:mm") : "");

export const fromLocalInput = (value: string) => (value ? new Date(value).toISOString() : null);

export const plural = (count: number, word: string, pluralWord = `${word}s`) => `${count} ${count === 1 ? word : pluralWord}`;

export const QUESTION_TYPE_LABEL = { mcq: "MCQ", short: "Short answer", long: "Long answer" } as const;

export const SECTION_LETTERS = ["A", "B", "C", "D"] as const;
