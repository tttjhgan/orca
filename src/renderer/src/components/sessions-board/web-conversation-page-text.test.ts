import { describe, expect, it } from 'vitest'
import type { BrowserHistoryEntry, BrowserPage } from '../../../../shared/browser-workspace-types'
import { normalizeBrowserHistoryUrl } from '../../../../shared/workspace-session-browser-history'
import { findPageShowingConversation } from './web-conversation-page-text'

function entry(overrides: Partial<BrowserHistoryEntry> = {}): BrowserHistoryEntry {
  return {
    url: 'https://chatgpt.com/c/abc',
    normalizedUrl: normalizeBrowserHistoryUrl('https://chatgpt.com/c/abc'),
    title: 'Postgres migration plan',
    faviconUrl: null,
    lastVisitedAt: 1_700_000_000_000,
    visitCount: 1,
    ...overrides
  }
}

function page(overrides: Partial<BrowserPage> = {}): BrowserPage {
  return {
    id: 'page-1',
    workspaceId: 'ws-1',
    worktreeId: 'wt-1',
    url: 'https://chatgpt.com/c/abc',
    title: 'Postgres migration plan',
    loading: false,
    faviconUrl: null,
    canGoBack: false,
    canGoForward: false,
    loadError: null,
    createdAt: 1_700_000_000_000,
    ...overrides
  }
}

describe('findPageShowingConversation', () => {
  it('finds the tab showing the conversation, whichever workspace hosts it', () => {
    const found = findPageShowingConversation(
      { 'wt-2': [page({ id: 'other', url: 'https://chatgpt.com/c/other' })], 'wt-1': [page()] },
      entry()
    )

    expect(found?.id).toBe('page-1')
  })

  it('matches a tab whose query and fragment moved on', () => {
    // The site rewrites its own state into the query as the conversation is used; the conversation
    // is still the one the card names.
    const found = findPageShowingConversation(
      { 'wt-1': [page({ url: 'https://chatgpt.com/c/abc?model=gpt-4#reply-9' })] },
      entry()
    )

    expect(found?.id).toBe('page-1')
  })

  it('finds no tab when none is showing the conversation', () => {
    expect(
      findPageShowingConversation({ 'wt-1': [page({ url: 'https://chatgpt.com/c/def' })] }, entry())
    ).toBeNull()
  })

  it('never returns a workspace document as the conversation', () => {
    // A document page's URL is blank by contract, and it is not a web page at all.
    const docPage = page({
      url: '',
      docLocation: { kind: 'workspace-doc', worktreeId: 'wt-1', filePath: 'a.md' }
    })

    expect(findPageShowingConversation({ 'wt-1': [docPage] }, entry())).toBeNull()
  })

  it('finds nothing for a conversation URL that cannot be parsed', () => {
    expect(findPageShowingConversation({ 'wt-1': [page()] }, entry({ url: '' }))).toBeNull()
  })
})
