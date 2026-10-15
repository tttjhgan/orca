// ---------------------------------------------------------------------------
// Browser page text — shared types
//
// A hand-off normally names a web conversation and lets the agent read it. This is
// the escape hatch for when the agent cannot: Orca's browser has its own cookie
// partition, so the tab the reader is looking at can be the only place the
// conversation exists. The reader asks for the text, the guest is read once, and
// what comes back is bounded here so a long transcript cannot fill a prompt.
// ---------------------------------------------------------------------------

/** How much of a page's text one hand-off may carry. */
export const PAGE_TEXT_CHAR_BUDGET = 8000

/** The head's share of the budget; the tail gets the rest. */
export const PAGE_TEXT_HEAD_CHAR_BUDGET = PAGE_TEXT_CHAR_BUDGET / 2

/** What the guest may send over the bridge before the clamp above is applied. */
export const PAGE_TEXT_RAW_CHAR_BUDGET = 200_000

/**
 * The mark left where the middle of a page's text was dropped: a conversation's
 * opening is its question and its end is its conclusion, and the middle is what
 * may be sacrificed to keep both.
 */
export const PAGE_TEXT_ELISION_MARK = '\n\n[...]\n\n'

/** A page's readable text as the guest reported it, bounded for one prompt. */
export type BrowserPageText = {
  /**
   * The page's own URL with the query and fragment stripped, so the renderer can check that the tab
   * still shows the conversation it read — and so a token in a query string never reaches an agent.
   */
  url: string
  /** The page's own title, which a conversation site sets to the conversation's name. */
  title: string
  text: string
  /** True when the middle of the page's text was dropped to fit the budget. */
  truncated: boolean
}

/**
 * Keep the head and the tail of a page's text and mark the elision between them.
 *
 * Why not the first N characters: a conversation's conclusion sits at the end, so a head-only cut
 * hands the agent the transcript's opening and none of its answer.
 */
export function clampPageText(raw: string): { text: string; truncated: boolean } {
  const text = raw.trim()
  if (text.length <= PAGE_TEXT_CHAR_BUDGET) {
    return { text, truncated: false }
  }
  const head = text.slice(0, PAGE_TEXT_HEAD_CHAR_BUDGET)
  const tail = text.slice(text.length - (PAGE_TEXT_CHAR_BUDGET - PAGE_TEXT_HEAD_CHAR_BUDGET))
  return { text: `${head}${PAGE_TEXT_ELISION_MARK}${tail}`, truncated: true }
}

export type BrowserReadPageTextArgs = { browserPageId: string }

/** Why a page's text could not be read, as a code the renderer translates. */
export type BrowserReadPageTextRejectReason = 'not-authorized' | 'not-ready' | 'unavailable'

export type BrowserReadPageTextResult =
  | { ok: true; page: BrowserPageText }
  | { ok: false; reason: BrowserReadPageTextRejectReason }
