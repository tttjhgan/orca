import type { BrowserHistoryEntry } from '../../../../shared/browser-workspace-types'
import {
  WEB_CONVERSATION_SITES,
  webConversationSiteForUrl,
  type WebConversationSiteId
} from '../../../../shared/web-conversation-sites'

// Why the web half of the board is derived in its own module rather than folded into
// `sessions-board-column-model`: an agent column groups `AiVaultSession` records by agent, and a
// web column groups `BrowserHistoryEntry` records by site. Sharing one grouping pass would mean
// one column type carrying both shapes and every consumer narrowing before it could read a field.

/** The board's column identity for a site, namespaced.
 *
 *  Why the namespace is load-bearing: `siteId` is not unique on the board. The registry's Kimi id
 *  is `'kimi'`, and `'kimi'` is also the id of the Kimi *CLI agent* in `AI_VAULT_AGENTS`, so a bare
 *  site id would put an agent column and a site column in one slot of the board's collapsed set —
 *  collapsing either would collapse both. */
export function webColumnKey(siteId: WebConversationSiteId): string {
  return `web:${siteId}`
}

export type SessionsBoardWebColumn = {
  /** Identity for React keys and the collapsed set. Prefer this over `siteId` for anything the
   *  board keys on — see `webColumnKey`. */
  columnKey: string
  siteId: WebConversationSiteId
  label: string
  /** Where this site starts a new chat. Carried here rather than looked up by the column: a
   *  conversation's own path is not where a new one begins. */
  newConversationUrl: string
  conversations: BrowserHistoryEntry[]
}

/** Case-insensitive over the title and the URL, matching how the board's search reads a session. */
function matchesQuery(entry: BrowserHistoryEntry, query: string): boolean {
  if (!query) {
    return true
  }
  const needle = query.trim().toLowerCase()
  if (!needle) {
    return true
  }
  return entry.title.toLowerCase().includes(needle) || entry.url.toLowerCase().includes(needle)
}

/**
 * One column per registered site that has a conversation to show, in registry order.
 *
 * A site with nothing visible emits no column, which is what keeps the board's empty state
 * reachable: a permanently-rendered "Kimi — 0" column would mean `columns.length === 0` could
 * never be true. The board header's new-conversation menu is what covers a site you have never
 * used, so nothing depends on the column existing.
 *
 * Why it maps the host but does not re-check the path: `webConversationHistory` only ever holds
 * conversation URLs — the field's write path and its load-time prune both run
 * `isWebConversationUrl` — so this groups a list that is already classified. Re-deciding here
 * would be a second, silently divergent copy of that rule.
 */
export function buildSessionsBoardWebColumns(
  history: readonly BrowserHistoryEntry[],
  filters: { query: string }
): SessionsBoardWebColumn[] {
  const bySite = new Map<WebConversationSiteId, BrowserHistoryEntry[]>()
  for (const entry of history) {
    if (!matchesQuery(entry, filters.query)) {
      continue
    }
    const site = webConversationSiteForUrl(entry.url)
    if (!site) {
      continue
    }
    const entries = bySite.get(site.id) ?? []
    entries.push(entry)
    bySite.set(site.id, entries)
  }

  return WEB_CONVERSATION_SITES.flatMap((site) => {
    const conversations = bySite.get(site.id)
    // Registry order is the column order: a site's position is a product decision, not a
    // function of how many conversations happen to be in it.
    return conversations?.length
      ? [
          {
            columnKey: webColumnKey(site.id),
            siteId: site.id,
            label: site.label,
            newConversationUrl: site.newConversationUrl,
            conversations
          }
        ]
      : []
  })
}
