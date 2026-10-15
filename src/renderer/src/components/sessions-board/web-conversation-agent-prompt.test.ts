import { describe, expect, it } from 'vitest'
import type { BrowserHistoryEntry } from '../../../../shared/browser-workspace-types'
import { formatWebConversationAgentPrompt } from './web-conversation-agent-prompt'

function entry(overrides: Partial<BrowserHistoryEntry> = {}): BrowserHistoryEntry {
  return {
    url: 'https://chat.deepseek.com/a/chat/s/abc',
    normalizedUrl: 'https://chat.deepseek.com/a/chat/s/abc',
    title: 'Postgres migration plan',
    faviconUrl: null,
    lastVisitedAt: 1_700_000_000_000,
    visitCount: 1,
    ...overrides
  }
}

describe('formatWebConversationAgentPrompt', () => {
  it('names the site, the URL and the title', () => {
    const prompt = formatWebConversationAgentPrompt(entry())

    expect(prompt).toContain('DeepSeek')
    expect(prompt).toContain('https://chat.deepseek.com/a/chat/s/abc')
    expect(prompt).toContain('Postgres migration plan')
  })

  it('tells the agent how to read the page itself, with the URL in the command', () => {
    const prompt = formatWebConversationAgentPrompt(entry())

    // Why the instruction and not a scraped transcript: nothing reads a page's content for the
    // agent, but the browser skill it already has can.
    expect(prompt).toContain('ORCA goto --url "https://chat.deepseek.com/a/chat/s/abc"')
    expect(prompt).toContain('ORCA snapshot --json')
  })

  it('omits the title line when the page has no title', () => {
    const prompt = formatWebConversationAgentPrompt(entry({ title: '   ' }))

    expect(prompt).not.toContain('Title:')
    // The URL is still there, so the instruction stands on its own.
    expect(prompt).toContain('https://chat.deepseek.com/a/chat/s/abc')
  })

  it('falls back to the URL when the site is not one the registry knows', () => {
    // Reachable when the registry drops a site but its entries are still in the list on disk.
    const prompt = formatWebConversationAgentPrompt(
      entry({ url: 'https://example.com/c/1', normalizedUrl: 'https://example.com/c/1' })
    )

    expect(prompt).toContain('https://example.com/c/1')
  })

  it('stays editable: the ask is left to the user rather than embedded in the prompt', () => {
    const prompt = formatWebConversationAgentPrompt(entry())

    // A placeholder the user fills in after the hand-off would be submitted as-is; the prompt
    // closes on a complete instruction instead.
    expect(prompt).not.toContain('<')
    expect(prompt.trimEnd().endsWith('.')).toBe(true)
  })

  describe('with the page text attached', () => {
    const pageText = {
      url: 'https://chat.deepseek.com/a/chat/s/abc',
      title: 'Postgres migration plan',
      text: 'Assistant: use a two-step migration.',
      truncated: false
    }

    it('carries the page’s own words into the prompt', () => {
      const prompt = formatWebConversationAgentPrompt(entry(), pageText)

      expect(prompt).toContain('Assistant: use a two-step migration.')
      expect(prompt).toContain('https://chat.deepseek.com/a/chat/s/abc')
    })

    it('stops telling the agent to go and read the page', () => {
      // Why this is the point of attaching at all: an agent's own browser session is not the one
      // that is logged in, so sending it to the URL again would summarize a different page.
      const prompt = formatWebConversationAgentPrompt(entry(), pageText)

      expect(prompt).not.toContain('ORCA snapshot --json')
      expect(prompt).not.toContain('ORCA goto')
    })

    it('says what was left out when the text was long enough to be cut', () => {
      const prompt = formatWebConversationAgentPrompt(entry(), { ...pageText, truncated: true })

      expect(prompt).toContain('left out')
    })

    it('still asks for the conclusion, so the hand-off works without further editing', () => {
      expect(formatWebConversationAgentPrompt(entry(), pageText)).toContain(
        'Summarize its conclusion'
      )
    })

    it('falls back to the reading instruction when the page had no text', () => {
      // A page that reported nothing readable is not an attachment; the agent is told to read it.
      const prompt = formatWebConversationAgentPrompt(entry(), { ...pageText, text: '' })

      expect(prompt).toContain('ORCA snapshot --json')
    })
  })
})
