import { describe, expect, it } from 'vitest'
import type { BrowserHistoryEntry } from '../../../../shared/browser-workspace-types'
import { buildSessionsBoardWebColumns } from './sessions-board-web-columns'

function entry(overrides: Partial<BrowserHistoryEntry> & { url: string }): BrowserHistoryEntry {
  return {
    normalizedUrl: overrides.url,
    title: '',
    faviconUrl: null,
    lastVisitedAt: 1_700_000_000_000,
    visitCount: 1,
    ...overrides
  }
}

describe('buildSessionsBoardWebColumns', () => {
  it('groups conversations by site in registry order, not in history order', () => {
    const columns = buildSessionsBoardWebColumns(
      [
        entry({ url: 'https://www.kimi.com/chat/1', title: 'kimi one' }),
        entry({ url: 'https://chat.deepseek.com/a/chat/s/1', title: 'deepseek one' }),
        entry({ url: 'https://chatgpt.com/c/1', title: 'chatgpt one' })
      ],
      { query: '' }
    )

    expect(columns.map((column) => column.siteId)).toEqual(['chatgpt', 'deepseek', 'kimi'])
    expect(columns.map((column) => column.label)).toEqual(['ChatGPT', 'DeepSeek', 'Kimi'])
  })

  it('emits no column for a site with no conversation', () => {
    const columns = buildSessionsBoardWebColumns([entry({ url: 'https://chatgpt.com/c/1' })], {
      query: ''
    })

    // Why it matters: the board's empty state is `every column list is empty`, so a permanently
    // rendered "Kimi — 0" column would make it unreachable.
    expect(columns.map((column) => column.siteId)).toEqual(['chatgpt'])
  })

  it('keeps every conversation of one site together, in history order', () => {
    const columns = buildSessionsBoardWebColumns(
      [
        entry({ url: 'https://chatgpt.com/c/2', title: 'second', lastVisitedAt: 2_000 }),
        entry({ url: 'https://chatgpt.com/c/1', title: 'first', lastVisitedAt: 1_000 })
      ],
      { query: '' }
    )

    expect(columns).toHaveLength(1)
    expect(columns[0].conversations.map((item) => item.title)).toEqual(['second', 'first'])
  })

  it('drops a URL whose host is no registered site', () => {
    const columns = buildSessionsBoardWebColumns(
      [
        entry({ url: 'https://example.com/c/1' }),
        entry({ url: 'https://chatgpt.com/c/1', title: 'kept' })
      ],
      { query: '' }
    )

    // Between the two of them, this and `web-conversation-sites.test.ts` cover the whole
    // classification: the host check is the builder's, and the path check belongs to the writer
    // that fills the list — see the why-comment on the builder.
    expect(columns).toHaveLength(1)
    expect(columns[0].conversations.map((item) => item.title)).toEqual(['kept'])
  })

  it('filters by title and by URL, case-insensitively', () => {
    const history = [
      entry({ url: 'https://chatgpt.com/c/abc', title: 'Postgres migration' }),
      entry({ url: 'https://chat.deepseek.com/a/chat/s/xyz', title: 'unrelated' })
    ]

    expect(
      buildSessionsBoardWebColumns(history, { query: 'POSTGRES' })[0].conversations
    ).toHaveLength(1)
    expect(buildSessionsBoardWebColumns(history, { query: 'deepseek' })[0].siteId).toBe('deepseek')
    expect(buildSessionsBoardWebColumns(history, { query: 'nothing' })).toEqual([])
    // Whitespace-only is not a query: it must not filter everything out.
    expect(buildSessionsBoardWebColumns(history, { query: '   ' })).toHaveLength(2)
  })

  it('carries the site’s new-conversation URL', () => {
    const columns = buildSessionsBoardWebColumns(
      [entry({ url: 'https://chat.deepseek.com/a/chat/s/1' })],
      { query: '' }
    )

    // The card's own path is not where a new chat begins, so the column has to know.
    expect(columns[0].newConversationUrl).toBe('https://chat.deepseek.com/')
  })
})
