import { describe, it, expect } from 'vitest'
import { parseWorkspaceSession } from './workspace-session-schema'
import { MAX_WEB_CONVERSATION_ENTRIES } from './workspace-session-web-conversations'

// Why this suite is separate from workspace-session-schema.test.ts: the schema is a plain z.object and
// zod strips unknown keys, so a field missing from it survives in-session and is silently gone after
// every relaunch. That is a bug class worth its own file, and the schema suite it was written in is
// already close to its max-lines budget.
describe('parseWorkspaceSession and web conversations', () => {
  it('keeps web conversations across a parse, and defaults the field when absent', () => {
    const entries = [
      {
        url: 'https://chatgpt.com/c/abc',
        normalizedUrl: 'https://chatgpt.com/c/abc',
        title: 'Shipping a scheduler',
        faviconUrl: 'https://chatgpt.com/favicon.ico',
        lastVisitedAt: 1_700_000_000_000,
        visitCount: 3
      }
    ]
    const result = parseWorkspaceSession({
      activeRepoId: null,
      activeWorktreeId: null,
      activeTabId: null,
      tabsByWorktree: {},
      terminalLayoutsByTabId: {},
      webConversationHistory: entries
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.webConversationHistory).toEqual(entries)
    }

    const withoutField = parseWorkspaceSession({
      activeRepoId: null,
      activeWorktreeId: null,
      activeTabId: null,
      tabsByWorktree: {},
      terminalLayoutsByTabId: {}
    })
    expect(withoutField.ok).toBe(true)
    if (withoutField.ok) {
      // Absent stays absent at the parse boundary, exactly as `browserUrlHistory` does; the
      // hydration action defaults it. Asserted so a future change to one of the two is visible.
      expect(withoutField.value.webConversationHistory).toBeUndefined()
      expect(withoutField.value.browserUrlHistory).toBeUndefined()
    }
  })

  it('caps and self-cleans web conversations while parsing', () => {
    const result = parseWorkspaceSession({
      activeRepoId: null,
      activeWorktreeId: null,
      activeTabId: null,
      tabsByWorktree: {},
      terminalLayoutsByTabId: {},
      webConversationHistory: [
        // A visit to a registered site's home page is furniture, not a conversation, so a
        // session written by an older or hand-edited build comes back without it.
        {
          url: 'https://chat.deepseek.com/',
          normalizedUrl: 'https://chat.deepseek.com',
          title: 'DeepSeek',
          lastVisitedAt: 1_700_000_000_500,
          visitCount: 1
        },
        ...Array.from({ length: 500 }, (_, index) => ({
          url: `https://chatgpt.com/c/${index}`,
          normalizedUrl: `https://chatgpt.com/c/${index}`,
          title: `Conversation ${index}`,
          lastVisitedAt: 1_700_000_000_000 - index,
          visitCount: 1
        }))
      ]
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      const conversations = result.value.webConversationHistory ?? []
      expect(conversations).toHaveLength(MAX_WEB_CONVERSATION_ENTRIES)
      expect(conversations[0]?.url).toBe('https://chatgpt.com/c/0')
      expect(conversations.at(-1)?.url).toBe(
        `https://chatgpt.com/c/${MAX_WEB_CONVERSATION_ENTRIES - 1}`
      )
      expect(conversations.some((entry) => entry.url === 'https://chat.deepseek.com/')).toBe(false)
    }
  })
})
