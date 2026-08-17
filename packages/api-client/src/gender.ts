/* The stored gender values and how they read in the UI. Mirrors the server's own allowlist
   (`GENDERS` in apps/api/src/schema.ts), which rejects anything outside it.

   `private` is what onboarding's "Rather not say" saves. It's a stored value rather than a null so
   the choice survives — but it's an answer about the user, not a label to show back to anyone else,
   which is why `flameGenderLabel` drops it from a flame's detail rows instead of printing it. */
export const GENDER_VALUES = ['girl', 'boy', 'nonbinary', 'private'] as const;

export type Gender = (typeof GENDER_VALUES)[number];

export const GENDER_LABEL: Record<string, string> = {
  girl: 'Girl',
  boy: 'Boy',
  nonbinary: 'Non-binary',
  private: 'Rather not say'
};

/** How to label a *voter's* gender on a flame. `null` means show nothing — see above. */
export function flameGenderLabel(gender: string | null | undefined): string | null {
  if (!gender || gender === 'private') return null;
  return GENDER_LABEL[gender] ?? gender;
}
