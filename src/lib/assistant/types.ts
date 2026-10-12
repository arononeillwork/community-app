/* Shapes shared by the assistant engine (server) and the chat UI (client). No server imports here. */

export type Lang = "en" | "es";

export type SourceKind =
  | "info" | "faq" | "bins" | "document" | "meeting" | "contacts" | "members" | "local"
  | "report" | "reports" | "money" | "finance" | "admin";

/** A place the answer came from. `href` is relative to the community, e.g. "/meetings/<id>". */
export type Source = { kind: SourceKind; label: string; href: string | null };

export type ContactCard = {
  name: string;
  role: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  hours: string | null;
  note?: string | null;
};

/** One short answer from the community's information (no-key retrieval answers). */
export type AnswerCard = { title: string; body: string; source: Source | null };

export type PendingStatus = "pending" | "confirmed" | "rejected" | "expired";

/** A report drafted by the assistant. Nothing is sent until the resident confirms. */
export type PendingReport = {
  id: string;
  status: PendingStatus;
  kind: "incident" | "complaint";
  title: string;
  description: string;
  location: string | null;
  category: string | null;
  urgent: boolean;
  reportId?: string | null;
};

export type AnswerMeta = {
  engine: "claude" | "retrieval";
  lang?: Lang;
  intro?: string;
  cards?: AnswerCard[];
  sources?: Source[];
  contacts?: ContactCard[];
  pending?: PendingReport;
  unanswered?: boolean;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  meta: AnswerMeta | null;
};

export type AskResult =
  | { ok: true; conversationId: string; question: ChatMessage; answer: ChatMessage }
  | { ok: false; error: string };

export type PendingResult =
  | { ok: true; pending: PendingReport }
  | { ok: false; error: string; pending?: PendingReport };

/** The payload stored in pending_actions for action_type = 'create_complaint'. */
export type ReportDraft = {
  kind: "incident" | "complaint";
  title: string;
  description: string;
  location: string | null;
  category: string | null;
  urgent: boolean;
};
