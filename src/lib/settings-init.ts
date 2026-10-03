/**
 * Which settings fields a first-day fill may write.
 *
 * The rule is the whole point of the module: a field the owner has already
 * typed is theirs and is never touched. `pnpm settings:init` is run once on a
 * fresh database, and then — because a command that is safe to repeat gets
 * repeated — again, after the owner has rewritten the greeting in the panel.
 * Overwriting it then would turn a repair tool into the thing that deletes
 * their work.
 *
 * «Empty» is blank after trimming: a field saved as a single space is as
 * missing to a buyer as one that was never set.
 */

export const FILLABLE = [
  "companyName",
  "address",
  "phone",
  "whatsappPhone",
  "deliveryTerms",
  "botGreeting",
] as const;

export type FillableField = (typeof FILLABLE)[number];
export type FillableSettings = Record<FillableField, string>;

/** The wanted values for exactly those fields of `existing` that are empty. */
export function emptyFieldsToFill(
  existing: FillableSettings,
  wanted: FillableSettings,
): Partial<FillableSettings> {
  const fill: Partial<FillableSettings> = {};
  for (const field of FILLABLE) {
    if (existing[field].trim() === "" && wanted[field].trim() !== "") {
      fill[field] = wanted[field];
    }
  }
  return fill;
}
