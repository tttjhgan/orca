import type { BrowserHistoryEntry } from './browser-workspace-types'
import type { WorkspaceSessionState } from './workspace-session-state-types'
import { redactKagiSessionToken } from './browser-url'
import {
  normalizeBrowserHistoryUrl,
  pruneWorkspaceSessionBrowserHistory
} from './workspace-session-browser-history'
import { isWebConversationUrl, webConversationIdentity } from './web-conversation-sites'

// Why a second list rather than a filter over `browserUrlHistory`: the board's job is
// finding a conversation again weeks later, and everyday browsing would evict it — the
// browsing list is capped and ordered by raw visit recency, so a heavy browsing day
// alone can push a conversation out. This list holds only conversations, so the same
// cap covers far more history.
export const MAX_WEB_CONVERSATION_ENTRIES = 200

/**
 * One conversation is one row, whichever link it was last reached by.
 *
 * Why not the stored `normalizedUrl`: three jobs key off this list — the row's own identity here,
 * the card's React key and the hand-off target's id on the board — and all three mean "this
 * conversation", not "this link". A site that tags the entry point in the query (Kimi's
 * `?chat_enter_method=home`) would otherwise split one conversation into a row per entry point,
 * each with its own count. The fallback covers an unparseable URL, which is filtered out before it
 * gets here anyway.
 */
function conversationRowKey(url: string, normalizedUrl: string): string {
  return webConversationIdentity(url) || normalizedUrl
}

/**
 * Normalizes the web-conversation list: newest first, one row per conversation, capped,
 * with Kagi tokens redacted. Entries that are no longer a conversation on a registered
 * site are dropped, which makes the list self-cleaning if the registry changes.
 *
 * Why the drop is acceptable even though it reaches the store and not just the board: the
 * alternative — keeping unclassifiable rows and filtering at render — spends the list's own cap on
 * them, so a site dropping out of the registry would push real conversations toward eviction. The
 * cost is that removing a host from the registry erases that host's stored history on the next
 * load; that is a deliberate edit to a one-line table, not something the user's browsing does, and
 * it is the only way the registry stays the single source of truth for what a conversation is.
 */
export function normalizeWebConversationHistoryEntries(
  entries: readonly BrowserHistoryEntry[]
): BrowserHistoryEntry[] {
  const seen = new Set<string>()
  const normalizedEntries: BrowserHistoryEntry[] = []
  // Persisted history may be unordered; normalize only until the retained cap is filled.
  const candidates = [...entries].sort((a, b) => b.lastVisitedAt - a.lastVisitedAt)

  for (const entry of candidates) {
    const safeUrl = redactKagiSessionToken(entry.url)
    if (!isWebConversationUrl(safeUrl)) {
      continue
    }
    const normalizedUrl = normalizeBrowserHistoryUrl(safeUrl)
    const key = conversationRowKey(safeUrl, normalizedUrl)
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    normalizedEntries.push(
      entry.url === safeUrl && entry.normalizedUrl === normalizedUrl
        ? entry
        : { ...entry, url: safeUrl, normalizedUrl }
    )
    if (normalizedEntries.length >= MAX_WEB_CONVERSATION_ENTRIES) {
      break
    }
  }
  return normalizedEntries
}

/** One recorded visit, as the browsing-history writer hands it over. */
export type BrowserHistoryVisit = {
  url: string
  normalizedUrl: string
  title: string
  faviconUrl?: string | null
  visitedAt: number
}

/**
 * Folds one visit into the conversation list: renames and bumps an existing conversation in
 * place, else prepends it. Returns `entries` unchanged — identity included — when the URL is
 * not a web conversation, so the caller can call this unconditionally.
 */
export function recordWebConversationVisit(
  entries: BrowserHistoryEntry[],
  visit: BrowserHistoryVisit
): BrowserHistoryEntry[] {
  if (!isWebConversationUrl(visit.url)) {
    return entries
  }
  const key = conversationRowKey(visit.url, visit.normalizedUrl)
  const existing = entries.find(
    (entry) => conversationRowKey(entry.url, entry.normalizedUrl) === key
  )
  if (!existing) {
    const prepended: BrowserHistoryEntry[] = [
      {
        url: visit.url,
        normalizedUrl: visit.normalizedUrl,
        title: visit.title,
        ...(visit.faviconUrl !== undefined ? { faviconUrl: visit.faviconUrl } : {}),
        lastVisitedAt: visit.visitedAt,
        visitCount: 1
      },
      ...entries
    ]
    return prepended.length > MAX_WEB_CONVERSATION_ENTRIES
      ? prepended
          .sort((a, b) => b.lastVisitedAt - a.lastVisitedAt)
          .slice(0, MAX_WEB_CONVERSATION_ENTRIES)
      : prepended
  }
  return entries.map((entry) =>
    entry === existing
      ? {
          ...entry,
          title: visit.title,
          ...(visit.faviconUrl !== undefined ? { faviconUrl: visit.faviconUrl } : {}),
          lastVisitedAt: visit.visitedAt,
          visitCount: entry.visitCount + 1
        }
      : entry
  )
}

/**
 * Repairs one stored conversation's favicon in place.
 *
 * Why not `recordWebConversationVisit`: a favicon usually arrives *after* the title update that
 * recorded the conversation, and arriving is not a visit — this must not bump the count or move the
 * timestamp. Returns `entries` unchanged, identity included, when there is nothing to repair, so
 * the caller can call it unconditionally.
 *
 * Why the row is found by conversation identity rather than by the recorded URL: the favicon
 * belongs to the conversation, and the row that holds it may have been recorded from a different
 * entry link than the one the page is on now.
 */
export function repairWebConversationFavicon(
  entries: BrowserHistoryEntry[],
  normalizedUrl: string,
  faviconUrl: string | null
): BrowserHistoryEntry[] {
  const key = conversationRowKey(normalizedUrl, normalizedUrl)
  const index = entries.findIndex(
    (entry) =>
      conversationRowKey(entry.url, entry.normalizedUrl) === key &&
      (entry.faviconUrl ?? null) !== faviconUrl
  )
  if (index === -1) {
    return entries
  }
  return entries.map((entry, current) => (current === index ? { ...entry, faviconUrl } : entry))
}

/**
 * Seeds the conversation list from the browsing history it was split out of.
 *
 * Why this exists: the conversation list is newer than the browsing history it summarises, so on
 * an install that predates it every conversation held so far is recorded in `browserUrlHistory`
 * and nowhere else — the board would show only conversations visited after the update. This runs
 * on load, where the two lists are first seen together.
 *
 * Idempotent by construction: only URLs missing from `conversations` are taken, so a second pass
 * cannot move a timestamp or add to a visit count. The recovered rows keep the browsing history's
 * own title, favicon, timestamp and count — that entry is the record of the visit, not a copy of
 * something the conversation list already knew.
 */
export function backfillWebConversationsFromBrowserHistory(
  conversations: BrowserHistoryEntry[],
  browserUrlHistory: readonly BrowserHistoryEntry[]
): BrowserHistoryEntry[] {
  // Why the conversation's identity and not its URL: the browsing list keeps one row per distinct
  // URL, so a conversation browsed by two entry links is two rows there — and matching those
  // against the conversation list by URL would recover a conversation the list already holds.
  const known = new Set(
    conversations.map((entry) => conversationRowKey(entry.url, entry.normalizedUrl))
  )
  const recovered = browserUrlHistory.filter(
    (entry) =>
      isWebConversationUrl(entry.url) &&
      !known.has(conversationRowKey(entry.url, entry.normalizedUrl))
  )
  if (recovered.length === 0) {
    // Same array back, so a load that recovers nothing does not re-render the board.
    return conversations
  }
  return normalizeWebConversationHistoryEntries([...conversations, ...recovered])
}

/**
 * Value equality over the list, so a write that changed nothing can hand back the same
 * state object instead of re-rendering every subscriber keyed on it.
 */
export function webConversationHistoryEqual(
  a: readonly BrowserHistoryEntry[],
  b: readonly BrowserHistoryEntry[]
): boolean {
  if (a.length !== b.length) {
    return false
  }
  return a.every((entry, index) => {
    const other = b[index]
    return (
      other !== undefined &&
      entry.url === other.url &&
      entry.normalizedUrl === other.normalizedUrl &&
      entry.title === other.title &&
      (entry.faviconUrl ?? null) === (other.faviconUrl ?? null) &&
      entry.lastVisitedAt === other.lastVisitedAt &&
      entry.visitCount === other.visitCount
    )
  })
}

/** Both history lists at once. They are fed by the same visit and capped independently, so a
 *  caller that pruned only one of them would leave a stale row behind in the other. Composing
 *  them here means a new prune site cannot pick up just one list by accident. */
export function pruneWorkspaceSessionHistoryLists(
  session: WorkspaceSessionState
): WorkspaceSessionState {
  return pruneWorkspaceSessionWebConversationHistory(pruneWorkspaceSessionBrowserHistory(session))
}

export function pruneWorkspaceSessionWebConversationHistory(
  session: WorkspaceSessionState
): WorkspaceSessionState {
  if (!session.webConversationHistory) {
    return session
  }
  const webConversationHistory = normalizeWebConversationHistoryEntries(
    session.webConversationHistory
  )
  if (webConversationHistoryEqual(webConversationHistory, session.webConversationHistory)) {
    return session
  }
  return { ...session, webConversationHistory }
}
