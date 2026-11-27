/** A paragraph, or a bulleted list. */
export type LegalBlock = string | { list: readonly string[] };

export interface LegalSection {
  heading: string;
  blocks: readonly LegalBlock[];
}

export interface LegalDocument {
  title: string;
  /** Shown under the title, e.g. "Last updated November 27, 2026". */
  lastUpdated: string;
  intro: string;
  sections: readonly LegalSection[];
}
