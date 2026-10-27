export type Role = "admin" | "teacher" | "student";
export type ApprovalStatus = "pending" | "approved" | "rejected";

export type User = {
  id: number;
  username: string;
  email: string;
  full_name: string;
  role: Role;
  approval_status: ApprovalStatus;
  rejection_reason: string;
  roll_number: string;
  department: string;
  date_joined: string;
};

export type AdminUser = User & {
  is_active: boolean;
  last_login: string | null;
  reviewed_at: string | null;
  reviewed_by_name: string | null;
};

export type Paginated<T> = { count: number; next: string | null; previous: string | null; results: T[] };

export type AdminStats = {
  students: number;
  teachers: number;
  pending_teachers: number;
  inactive_users: number;
  classes: number;
  exams: number;
  published_exams: number;
  attempts: number;
  attempts_in_progress: number;
};

export type Classroom = {
  id: number;
  name: string;
  course_code: string;
  description: string;
  join_code: string;
  is_joining_open: boolean;
  is_archived: boolean;
  created_at: string;
  teacher_name: string;
  student_count: number;
  exam_count: number;
};

export type StudentClassroom = Pick<Classroom, "id" | "name" | "course_code" | "description" | "teacher_name" | "is_archived">;

export type Enrollment = {
  id: number;
  student_id: number;
  full_name: string;
  username: string;
  email: string;
  roll_number: string;
  joined_at: string;
};

export type QuestionType = "mcq" | "short" | "long";
export type OvertimePolicy = "hard_lock" | "grace";
export type ExamStatus = "draft" | "scheduled" | "open" | "closed";

export type Question = {
  id?: number;
  type: QuestionType;
  text: string;
  options: string[];
  correct_option: number | null;
  marks: number;
  marking_guidelines: string;
};

export type Section = {
  id?: number;
  order?: number;
  title: string;
  instructions: string;
  duration_minutes: number;
  questions: Question[];
};

export type ClassRef = { id: number; name: string; course_code: string };

export type ExamSettings = {
  classroom: number;
  title: string;
  instructions: string;
  available_from: string | null;
  available_until: string | null;
  max_attempts: number;
  allow_modular: boolean;
  overtime_policy: OvertimePolicy;
  grace_minutes: number;
  shuffle_questions: boolean;
  shuffle_options: boolean;
  pass_percentage: number;
};

export type ExamDetail = Omit<ExamSettings, "classroom"> & {
  id: number;
  classroom: ClassRef;
  status: ExamStatus;
  is_published: boolean;
  published_at: string | null;
  opens_at: string | null;
  total_minutes: number;
  total_marks: number;
  question_count: number;
  has_attempts: boolean;
  created_at: string;
  updated_at: string;
  sections: Section[];
};

export type ExamListItem = {
  id: number;
  classroom: ClassRef;
  title: string;
  status: ExamStatus;
  is_published: boolean;
  opens_at: string | null;
  available_until: string | null;
  max_attempts: number;
  total_minutes: number;
  total_marks: number;
  question_count: number;
  section_count: number;
  attempt_count: number;
  pending_grading_count: number;
  created_at: string;
};

export type AttemptMode = "full" | "modular";
export type AttemptStatus = "in_progress" | "completed";
export type GradingStatus = "pending" | "graded";
export type SectionAttemptStatus = "locked" | "in_progress" | "submitted" | "timed_out";

export type AttemptSummary = {
  id: number;
  exam_id: number;
  attempt_number: number;
  mode: AttemptMode;
  status: AttemptStatus;
  started_at: string;
  completed_at: string | null;
  is_overtime: boolean;
  overtime_seconds: number;
  timed_out: boolean;
  grading_status: GradingStatus;
  max_score: number;
};

export type StudentScore = { score: number | null; percentage: number | null; passed: boolean | null };

export type StudentExamState = "in_progress" | "available" | "upcoming" | "completed" | "missed";

export type StudentExamCard = {
  id: number;
  title: string;
  instructions: string;
  classroom: ClassRef;
  teacher_name: string;
  opens_at: string | null;
  available_until: string;
  total_minutes: number;
  total_marks: number;
  sections: { order: number; title: string; duration_minutes: number; question_count: number; marks: number }[];
  allow_modular: boolean;
  overtime_policy: OvertimePolicy;
  grace_minutes: number;
  pass_percentage: number;
  attempts_allowed: number;
  attempts_used: number;
  state: StudentExamState;
  can_start: boolean;
  active_attempt_id: number | null;
  attempts: (AttemptSummary & StudentScore)[];
};

export type LiveOption = { index: number; text: string };

export type LiveQuestion = {
  id: number;
  type: QuestionType;
  text: string;
  marks: number;
  options?: LiveOption[];
  selected_option: number | null;
  text_answer: string;
};

export type LiveSection = {
  id: number;
  section_id: number;
  order: number;
  title: string;
  instructions: string;
  duration_minutes: number;
  question_count: number;
  marks: number;
  status: SectionAttemptStatus;
  started_at: string | null;
  deadline: string | null;
  submitted_at: string | null;
  questions: LiveQuestion[] | null;
};

export type LiveAttempt = AttemptSummary & {
  server_now: string;
  grace_seconds: number;
  leeway_seconds: number;
  exam: {
    id: number;
    title: string;
    instructions: string;
    classroom_name: string;
    overtime_policy: OvertimePolicy;
    grace_minutes: number;
    available_until: string;
  };
  sections: LiveSection[];
};

export type ResultQuestion = LiveQuestion & {
  marks_awarded: number | null;
  feedback: string;
  correct_option?: number | null;
};

export type AttemptResult = AttemptSummary &
  StudentScore & {
    pass_percentage: number;
    answers_revealed: boolean;
    exam: { id: number; title: string; classroom_name: string; available_until: string };
    sections: {
      id: number;
      order: number;
      title: string;
      status: SectionAttemptStatus;
      started_at: string | null;
      submitted_at: string | null;
      overtime_seconds: number;
      questions: ResultQuestion[];
    }[];
  };

export type StudentRef = { id: number; full_name: string; username: string; roll_number: string };

export type TeacherAttemptRow = AttemptSummary & {
  score: number | null;
  percentage: number | null;
  passed: boolean | null;
  duration_seconds: number | null;
  integrity_event_count: number;
  student: StudentRef;
  sections: {
    order: number;
    title: string;
    status: SectionAttemptStatus;
    started_at: string | null;
    deadline: string | null;
    submitted_at: string | null;
    overtime_seconds: number;
  }[];
};

export type IntegrityKind = "tab_hidden" | "window_blur" | "fullscreen_exit" | "copy" | "paste" | "context_menu";

export type GradingQuestion = {
  id: number;
  type: QuestionType;
  text: string;
  marks: number;
  options: string[];
  correct_option: number | null;
  marking_guidelines: string;
  selected_option: number | null;
  text_answer: string;
  marks_awarded: number | null;
  ai_suggested_marks: number | null;
  ai_feedback: string;
  teacher_feedback: string;
  graded_by: string | null;
};

export type TeacherAttemptDetail = TeacherAttemptRow & {
  pass_percentage: number;
  exam: { id: number; title: string };
  integrity: { total: number; by_kind: Record<IntegrityKind, number> };
  integrity_events: { kind: IntegrityKind; occurred_at: string }[];
  question_sections: { order: number; title: string; status: SectionAttemptStatus; questions: GradingQuestion[] }[];
};

export type ExamResults = {
  exam: ExamDetail;
  stats: {
    enrolled_students: number;
    students_attempted: number;
    total_attempts: number;
    in_progress: number;
    completed: number;
    within_time: number;
    overtime: number;
    timed_out: number;
    pending_grading: number;
    average_percentage: number | null;
    highest_percentage: number | null;
    lowest_percentage: number | null;
    pass_count: number;
    modular_attempts: number;
    flagged_attempts: number;
  };
  attempts: TeacherAttemptRow[];
  not_attempted: StudentRef[];
  allowances: { student_id: number; extra_attempts: number }[];
};

export type GeneratedQuestions = { title: string; questions: Question[]; requested: number };
