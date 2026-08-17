/* US-only phone helpers. The auth design ships a fixed 🇺🇸 +1 country chip with no picker, so
   everything here assumes +1; revisit both this and PhoneField together if other countries land. */

/** Digits the user typed -> E.164 for Clerk (`+15125550134`). */
export function toE164(input: string): string {
  const digits = input.replace(/\D/g, '');
  // Tolerate someone typing the leading 1 themselves.
  const local = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  return `+1${local}`;
}

/** Display form used in the "code sent to …" line: `+1 (512) 555-0134`. */
export function formatUsPhone(input: string): string {
  const digits = input.replace(/\D/g, '');
  const local = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  if (local.length !== 10) return `+1 ${local}`; // partial/odd input — show it rather than mangling
  return `+1 (${local.slice(0, 3)}) ${local.slice(3, 6)}-${local.slice(6)}`;
}
