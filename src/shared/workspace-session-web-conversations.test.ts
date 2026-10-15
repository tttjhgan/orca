import { describe, expect, it } from 'vitest'
import type { BrowserHistoryEntry } from './browser-workspace-types'
import {
  backfillWebConversationsFromBrowserHistory,
  MAX_WEB_CONVERSATION_ENTRIES,
  normalizeWebConversationHistoryEntries,
  pruneWorkspaceSessionHistoryLists,
  recordWebConversationVisit,
  repairWebConversationFavicon,
  webConversationHistoryEqual
} from './workspace-session-web-conversations'
import { getDefaultWorkspaceSession } from './constants'

function entry(overrides: Partial<BrowserHistoryEntry> = {}): BrowserHistoryEntry {
  return {
    url: 'https://chatgpt.com/c/abc',
    normalizedUrl: 'https://chatgpt.com/c/abc',
    title: 'A conversation',
    lastVisitedAt: 1_700_000_000_000,
    visitCount: 1,
    ...overrides
  }
}

describe('normalizeWebConversationHistoryEntries', () => {
  it('sorts newest first', () => {
    const normalized = normalizeWebConversationHistoryEntries([
      entry({ url: 'https://chatgpt.com/c/old', normalizedUrl: 'https://chatgpt.com/c/old' }),
      entry({
        url: 'https://chatgpt.com/c/new',
        normalizedUrl: 'https://chatgpt.com/c/new',
        lastVisitedAt: 1_700_000_000_900
      })
    ])

    expect(normalized.map((row) => row.url)).toEqual([
      'https://chatgpt.com/c/new',
      'https://chatgpt.com/c/old'
    ])
  })

  it('drops a URL that is no longer a conversation, which makes the list self-cleaning', () => {
    const normalized = normalizeWebConversationHistoryEntries([
      entry({ url: 'https://chatgpt.com/pricing', normalizedUrl: 'https://chatgpt.com/pricing' }),
      entry(),
      entry({ url: 'https://example.com/c/abc', normalizedUrl: 'https://example.com/c/abc' })
    ])

    expect(normalized.map((row) => row.url)).toEqual(['https://chatgpt.com/c/abc'])
  })

  it('dedupes by conversation, keeping the newest', () => {
    const normalized = normalizeWebConversationHistoryEntries([
      entry({ visitCount: 2 }),
      entry({ title: 'Renamed', visitCount: 5, lastVisitedAt: 1_700_000_000_800 })
    ])

    expect(normalized).toHaveLength(1)
    expect(normalized[0]).toMatchObject({ title: 'Renamed', visitCount: 5 })
  })

  it('keeps one row for a conversation two different entry links lead to', () => {
    // The failure this pins: a site tags the link you arrived by, so the same conversation reached
    // from the home page and from anywhere else is two URLs. Held as two, it was two cards in one
    // column, each with its own visit count and its own hand-off target.
    const normalized = normalizeWebConversationHistoryEntries([
      entry({
        url: 'https://www.kimi.com/chat/abc?chat_enter_method=home',
        normalizedUrl: 'https://www.kimi.com/chat/abc?chat_enter_method=home',
        visitCount: 4
      }),
      entry({
        url: 'https://www.kimi.com/chat/abc?chat_enter_method=history',
        normalizedUrl: 'https://www.kimi.com/chat/abc?chat_enter_method=history',
        title: 'Postgres migration plan',
        visitCount: 2,
        lastVisitedAt: 1_700_000_000_900
      })
    ])

    expect(normalized).toHaveLength(1)
    expect(normalized[0]).toMatchObject({ title: 'Postgres migration plan', visitCount: 2 })
  })

  it('caps the list', () => {
    const entries = Array.from({ length: MAX_WEB_CONVERSATION_ENTRIES + 30 }, (_, index) =>
      entry({
        url: `https://chatgpt.com/c/${index}`,
        normalizedUrl: `https://chatgpt.com/c/${index}`,
        lastVisitedAt: 1_700_000_000_000 - index
      })
    )

    expect(normalizeWebConversationHistoryEntries(entries)).toHaveLength(
      MAX_WEB_CONVERSATION_ENTRIES
    )
  })

  it('keeps a row identical when normalization changed nothing', () => {
    const rows = [entry()]
    expect(normalizeWebConversationHistoryEntries(rows)[0]).toBe(rows[0])
  })
})

describe('recordWebConversationVisit', () => {
  it('prepends a conversation it has not seen', () => {
    const next = recordWebConversationVisit([], {
      url: 'https://chat.deepseek.com/a/chat/s/1',
      normalizedUrl: 'https://chat.deepseek.com/a/chat/s/1',
      title: 'DeepSeek answer',
      faviconUrl: 'https://chat.deepseek.com/favicon.ico',
      visitedAt: 1_700_000_000_100
    })

    expect(next).toEqual([
      {
        url: 'https://chat.deepseek.com/a/chat/s/1',
        normalizedUrl: 'https://chat.deepseek.com/a/chat/s/1',
        title: 'DeepSeek answer',
        faviconUrl: 'https://chat.deepseek.com/favicon.ico',
        lastVisitedAt: 1_700_000_000_100,
        visitCount: 1
      }
    ])
  })

  it('bumps an existing conversation in place, keeping its position', () => {
    const rows = [
      entry({ url: 'https://chatgpt.com/c/first', normalizedUrl: 'https://chatgpt.com/c/first' }),
      entry()
    ]
    const next = recordWebConversationVisit(rows, {
      url: 'https://chatgpt.com/c/abc',
      normalizedUrl: 'https://chatgpt.com/c/abc',
      title: 'Renamed',
      visitedAt: 1_700_000_000_500
    })

    expect(next).toHaveLength(2)
    expect(next[0]).toBe(rows[0])
    expect(next[1]).toMatchObject({
      title: 'Renamed',
      visitCount: 2,
      lastVisitedAt: 1_700_000_000_500
    })
  })

  it('bumps a conversation reached by a different entry link instead of adding a card', () => {
    const rows = [
      entry({
        url: 'https://www.kimi.com/chat/abc?chat_enter_method=home',
        normalizedUrl: 'https://www.kimi.com/chat/abc?chat_enter_method=home'
      })
    ]
    const next = recordWebConversationVisit(rows, {
      url: 'https://www.kimi.com/chat/abc?chat_enter_method=sidebar',
      normalizedUrl: 'https://www.kimi.com/chat/abc?chat_enter_method=sidebar',
      title: 'Renamed',
      visitedAt: 1_700_000_000_500
    })

    expect(next).toHaveLength(1)
    expect(next[0]).toMatchObject({
      // The recorded link is the one the row already held: the identity is what matched, and the row
      // keeps pointing at a link that opens the same conversation.
      url: 'https://www.kimi.com/chat/abc?chat_enter_method=home',
      title: 'Renamed',
      visitCount: 2,
      lastVisitedAt: 1_700_000_000_500
    })
  })

  it('leaves the list untouched and unchanged for a URL that is not a conversation', () => {
    const rows = [entry()]
    const visit = {
      url: 'https://example.com/reading',
      normalizedUrl: 'https://example.com/reading',
      title: 'A blog post',
      visitedAt: 1_700_000_000_900
    }

    expect(recordWebConversationVisit(rows, visit)).toBe(rows)
    expect(recordWebConversationVisit(rows, { ...visit, url: 'https://chatgpt.com/pricing' })).toBe(
      rows
    )
  })

  it('caps the list on the prepend path', () => {
    const rows = Array.from({ length: MAX_WEB_CONVERSATION_ENTRIES }, (_, index) =>
      entry({
        url: `https://chatgpt.com/c/${index}`,
        normalizedUrl: `https://chatgpt.com/c/${index}`,
        lastVisitedAt: 1_700_000_000_000 - index
      })
    )

    const next = recordWebConversationVisit(rows, {
      url: 'https://chatgpt.com/c/newest',
      normalizedUrl: 'https://chatgpt.com/c/newest',
      title: 'Newest',
      visitedAt: 1_700_000_001_000
    })

    expect(next).toHaveLength(MAX_WEB_CONVERSATION_ENTRIES)
    expect(next[0]?.url).toBe('https://chatgpt.com/c/newest')
  })
})

describe('webConversationHistoryEqual', () => {
  it('compares favicon presence as absence when both are null', () => {
    const withNull = entry({ faviconUrl: null })
    const withUndefined = entry()
    expect(webConversationHistoryEqual([withNull], [withUndefined])).toBe(true)
  })

  it('reports a changed count as unequal', () => {
    expect(webConversationHistoryEqual([entry()], [entry({ visitCount: 2 })])).toBe(false)
    expect(webConversationHistoryEqual([entry()], [])).toBe(false)
  })
})

describe('pruneWorkspaceSessionHistoryLists', () => {
  it('prunes both lists in one pass and returns the same session when neither changed', () => {
    const base = getDefaultWorkspaceSession()
    const untouched = pruneWorkspaceSessionHistoryLists(base)
    expect(untouched).toBe(base)

    const pruned = pruneWorkspaceSessionHistoryLists({
      ...base,
      browserUrlHistory: [
        entry({ url: 'https://example.com/a', normalizedUrl: 'https://example.com/a' })
      ],
      webConversationHistory: [
        entry({ url: 'https://chatgpt.com/pricing', normalizedUrl: 'https://chatgpt.com/pricing' }),
        entry()
      ]
    })

    expect(pruned.browserUrlHistory).toHaveLength(1)
    expect(pruned.webConversationHistory).toHaveLength(1)
    expect(pruned.webConversationHistory?.[0]?.url).toBe('https://chatgpt.com/c/abc')
  })
})

describe('backfillWebConversationsFromBrowserHistory', () => {
  // Why this pass exists at all: the conversation list is younger than the browsing history it is
  // split out of, so on an install that predates it every earlier conversation is recorded in
  // `browserUrlHistory` and nowhere else.
  it('recovers conversations held before the list existed, newest first', () => {
    const recovered = backfillWebConversationsFromBrowserHistory(
      [],
      [
        entry({
          url: 'https://chat.deepseek.com/a/chat/s/old',
          normalizedUrl: 'https://chat.deepseek.com/a/chat/s/old',
          title: 'Older thread',
          lastVisitedAt: 1_700_000_000_000
        }),
        entry({
          url: 'https://chat.deepseek.com/a/chat/s/new',
          normalizedUrl: 'https://chat.deepseek.com/a/chat/s/new',
          title: 'Newer thread',
          lastVisitedAt: 1_700_000_000_900
        })
      ]
    )

    expect(recovered.map((row) => row.title)).toEqual(['Newer thread', 'Older thread'])
    // The browsing entry *is* the record of the visit, so its count and title carry over untouched.
    expect(recovered[1]).toMatchObject({ visitCount: 1, lastVisitedAt: 1_700_000_000_000 })
  })

  it('leaves an already-recorded conversation exactly as it is', () => {
    const recorded = [entry({ title: 'Renamed by the site', visitCount: 4 })]

    const result = backfillWebConversationsFromBrowserHistory(recorded, [
      entry({ title: 'Stale title', visitCount: 1, lastVisitedAt: 1_600_000_000_000 })
    ])

    // Why not merge the two: the conversation list has been maintained on every visit since, so
    // the browsing row is the older record. Taking it would reset the count and the rename.
    expect(result).toEqual(recorded)
  })

  it('takes nothing that is not a conversation on a registered site', () => {
    const result = backfillWebConversationsFromBrowserHistory(
      [],
      [
        entry({
          url: 'https://chat.deepseek.com/',
          normalizedUrl: 'https://chat.deepseek.com/'
        }),
        entry({ url: 'https://example.com/c/abc', normalizedUrl: 'https://example.com/c/abc' }),
        entry({ url: 'https://chatgpt.com/pricing', normalizedUrl: 'https://chatgpt.com/pricing' })
      ]
    )

    expect(result).toEqual([])
  })

  it('does not recover a conversation the list already holds under another entry link', () => {
    // The browsing list keeps one row per distinct URL, so it can hold one conversation twice; the
    // conversation list holds it once, under whichever link recorded it. Matching the two up by URL
    // would have recovered the conversation the list already had.
    const conversations = [
      entry({
        url: 'https://www.kimi.com/chat/abc?chat_enter_method=home',
        normalizedUrl: 'https://www.kimi.com/chat/abc?chat_enter_method=home'
      })
    ]
    const history = [
      entry({
        url: 'https://www.kimi.com/chat/abc?chat_enter_method=sidebar',
        normalizedUrl: 'https://www.kimi.com/chat/abc?chat_enter_method=sidebar',
        title: 'From the browsing list',
        lastVisitedAt: 1_700_000_000_900
      })
    ]

    expect(backfillWebConversationsFromBrowserHistory(conversations, history)).toBe(conversations)
  })

  it('returns the same array when there is nothing to recover', () => {
    const conversations = [entry()]

    // Identity matters: this runs on every load, and a fresh array would re-render the board.
    expect(backfillWebConversationsFromBrowserHistory(conversations, [])).toBe(conversations)
    expect(backfillWebConversationsFromBrowserHistory(conversations, [entry()])).toBe(conversations)
  })

  it('is idempotent, so a second load cannot change a recovered row', () => {
    const history = [
      entry({
        url: 'https://kimi.com/chat/abc',
        normalizedUrl: 'https://kimi.com/chat/abc',
        lastVisitedAt: 1_700_000_000_500
      })
    ]

    const once = backfillWebConversationsFromBrowserHistory([], history)
    const twice = backfillWebConversationsFromBrowserHistory(once, history)

    expect(twice).toEqual(once)
  })
})

describe('repairWebConversationFavicon', () => {
  it('puts the favicon on the conversation it belongs to and nothing else', () => {
    const entries = [
      entry({ url: 'https://chatgpt.com/c/a', normalizedUrl: 'https://chatgpt.com/c/a' }),
      entry({
        url: 'https://chatgpt.com/c/b',
        normalizedUrl: 'https://chatgpt.com/c/b',
        lastVisitedAt: 1_700_000_000_001
      })
    ]

    const repaired = repairWebConversationFavicon(
      entries,
      'https://chatgpt.com/c/a',
      'https://chatgpt.com/favicon.ico'
    )

    expect(repaired[0]?.faviconUrl).toBe('https://chatgpt.com/favicon.ico')
    expect(repaired[1]?.faviconUrl).toBeUndefined()
  })

  it('finds the conversation even when the tab is on a different entry link', () => {
    const entries = [
      entry({
        url: 'https://www.kimi.com/chat/abc?chat_enter_method=home',
        normalizedUrl: 'https://www.kimi.com/chat/abc?chat_enter_method=home'
      })
    ]

    const repaired = repairWebConversationFavicon(
      entries,
      'https://www.kimi.com/chat/abc?chat_enter_method=sidebar',
      'https://www.kimi.com/favicon.ico'
    )

    // The favicon belongs to the conversation, not to one of the links that open it: without this
    // the card kept the globe fallback for a conversation the reader was looking at right then.
    expect(repaired[0]?.faviconUrl).toBe('https://www.kimi.com/favicon.ico')
  })

  it('does not treat the arrival of a favicon as a visit', () => {
    const entries = [entry({ visitCount: 3 })]

    const repaired = repairWebConversationFavicon(entries, entry().normalizedUrl, 'https://x/f.png')

    // The title update that first recorded the conversation is the visit; the favicon that
    // follows it is metadata arriving late, so neither the count nor the timestamp may move.
    expect(repaired[0]).toMatchObject({ visitCount: 3, lastVisitedAt: entries[0]?.lastVisitedAt })
  })

  it('returns the same array when there is nothing to repair', () => {
    const entries = [entry({ faviconUrl: null })]

    // This runs on every page-state update, so a fresh array here would re-render the board.
    expect(repairWebConversationFavicon(entries, entry().normalizedUrl, null)).toBe(entries)
    expect(repairWebConversationFavicon(entries, 'https://chatgpt.com/c/missing', 'x')).toBe(
      entries
    )
  })
})
