/**
 * AI provider interface and proposal types.
 *
 * The contract is intentionally narrow: a provider returns a list of
 * symbolic LayoutProposals. It never returns world coordinates,
 * Placement records, or "approved" layouts. The geometry engine alone
 * materializes proposals into Placements and decides whether the
 * resulting Layout is valid.
 */

export interface AIProviderInput {
  readonly scale: "N" | "HO" | string;
  readonly boardMm: { readonly width: number; readonly height: number };
  /** Codes the user already owns, in available quantity. */
  readonly availableInventory: Readonly<Record<string, number>>;
  /** Free-text user intent: "small passing siding", "scenic L-layout"... */
  readonly userIntent?: string;
  /** How many proposals to return. */
  readonly maxProposals?: number;
}

export type ProposalMove =
  | {
      readonly kind: "place";
      readonly ref: string;
      readonly code: string;
    }
  | {
      readonly kind: "attach";
      readonly ref: string;
      readonly code: string;
      readonly toRef: string;
      readonly toConn: string;
      readonly conn: string;
      readonly mirrored?: boolean;
    }
  | {
      /**
       * Adds an Attachment between two refs already created by earlier
       * `place` / `attach` moves. Used to close a loop (last → first)
       * without re-placing the existing pieces.
       */
      readonly kind: "link";
      readonly from: string;
      readonly fromConn: string;
      readonly to: string;
      readonly toConn: string;
    };

export interface LayoutProposal {
  readonly name: string;
  readonly rationale: string;
  readonly moves: readonly ProposalMove[];
}

export interface AIProvider {
  readonly id: string;
  readonly displayName: string;
  /** True if generateLayoutSuggestion can actually call the network. */
  readonly available: boolean;
  generateLayoutSuggestion(input: AIProviderInput): Promise<LayoutProposal[]>;
}
