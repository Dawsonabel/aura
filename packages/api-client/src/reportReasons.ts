/* 8A's report reasons. These are chips in the UI but there is no enum server-side: `reportUser`
   takes a free-text `reason` capped at 300 chars, which the admin dashboard shows verbatim. The
   chip label is therefore written into that text as the first line, with any extra detail the
   reporter typed appended after it — so an admin reading apps/web's reports table sees the category
   without the API needing a migration. Shared so the two apps can't drift on the wording an admin
   is reading. */
export const REPORT_REASONS = [
  'Bullying or harassment',
  'Fake or impersonating account',
  "Doesn't go to this school",
  'Sexual or inappropriate content',
  'Threats or self-harm',
  'Something else'
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number];

/** Max length of the stored reason — matches the server's own `.slice(0, 300)`. */
export const REPORT_REASON_MAX = 300;

/** Chip label plus optional free text, as one string for the free-text `reason` field. */
export function composeReportReason(reason: ReportReason, detail: string): string {
  const extra = detail.trim();
  return (extra ? `${reason} — ${extra}` : reason).slice(0, REPORT_REASON_MAX);
}
