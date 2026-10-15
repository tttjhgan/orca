// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { BrowserHistoryEntry } from '../../../../shared/browser-workspace-types'
import { WebConversationCard, opensInSystemBrowser } from './WebConversationCard'
import { WebConversationHandOffMenu } from './WebConversationHandOffMenu'

const entry: BrowserHistoryEntry = {
  url: 'https://chat.deepseek.com/a/chat/s/abc',
  normalizedUrl: 'https://chat.deepseek.com/a/chat/s/abc',
  title: 'Postgres migration plan',
  faviconUrl: 'https://chat.deepseek.com/favicon.ico',
  lastVisitedAt: Date.now() - 90 * 60_000,
  visitCount: 3
}

function renderCard(overrides: { onOpen?: () => void } = {}): {
  onOpen: ReturnType<typeof vi.fn>
  onOpenInSystemBrowser: ReturnType<typeof vi.fn>
  onCopyLink: ReturnType<typeof vi.fn>
  onHandOff: ReturnType<typeof vi.fn>
} {
  const onOpen = vi.fn(overrides.onOpen)
  const onOpenInSystemBrowser = vi.fn()
  const onCopyLink = vi.fn()
  const onHandOff = vi.fn()
  render(
    <TooltipProvider>
      <WebConversationCard
        entry={entry}
        onOpen={onOpen}
        onOpenInSystemBrowser={onOpenInSystemBrowser}
        onCopyLink={onCopyLink}
        handOffMenu={
          <button type="button" data-testid="sessions-board-web-card-hand-off" onClick={onHandOff}>
            hand off
          </button>
        }
      />
    </TooltipProvider>
  )
  return { onOpen, onOpenInSystemBrowser, onCopyLink, onHandOff }
}

afterEach(cleanup)

describe('WebConversationCard', () => {
  it('names the conversation and reports its own visits and recency', () => {
    renderCard()

    expect(screen.getByText('Postgres migration plan')).toBeTruthy()
    expect(screen.getByText('3 visits')).toBeTruthy()
  })

  it('falls back to the URL when the page had no title', () => {
    render(
      <TooltipProvider>
        <WebConversationCard
          entry={{ ...entry, title: '   ' }}
          onOpen={vi.fn()}
          onOpenInSystemBrowser={vi.fn()}
          onCopyLink={vi.fn()}
          handOffMenu={null}
        />
      </TooltipProvider>
    )

    expect(screen.getByText(entry.url)).toBeTruthy()
  })

  it('opens in Orca’s browser when the body is clicked', async () => {
    const { onOpen, onOpenInSystemBrowser } = renderCard()

    await userEvent.click(screen.getByTestId('sessions-board-web-card'))

    expect(onOpen).toHaveBeenCalledTimes(1)
    expect(onOpenInSystemBrowser).not.toHaveBeenCalled()
  })

  it('opens in the system browser when the modifier is held', () => {
    const { onOpen, onOpenInSystemBrowser } = renderCard()

    // Ctrl rather than Cmd: the test environment's user agent is not a Mac, and the per-platform
    // pair is covered directly by the `opensInSystemBrowser` case below.
    fireEvent.click(screen.getByTestId('sessions-board-web-card'), {
      shiftKey: true,
      ctrlKey: true
    })

    // Why the modifier and not a setting: Orca's browser has its own cookie partition, so the
    // everyday browser has to stay one gesture away.
    expect(onOpenInSystemBrowser).toHaveBeenCalledTimes(1)
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('fires each cluster action from its own control', async () => {
    const { onOpenInSystemBrowser, onCopyLink, onHandOff } = renderCard()

    await userEvent.click(screen.getByTestId('sessions-board-web-card-hand-off'))
    await userEvent.click(screen.getByTestId('sessions-board-web-card-system-browser'))
    await userEvent.click(screen.getByTestId('sessions-board-web-card-copy-link'))

    expect(onHandOff).toHaveBeenCalledTimes(1)
    expect(onOpenInSystemBrowser).toHaveBeenCalledTimes(1)
    expect(onCopyLink).toHaveBeenCalledTimes(1)
  })

  it('spells out the system-browser shortcut on the control and the body', () => {
    renderCard()

    expect(
      screen.getByTestId('sessions-board-web-card-system-browser').getAttribute('aria-label')
    ).toContain('Open in system browser')
    expect(screen.getByTestId('sessions-board-web-card').getAttribute('title')).toContain(
      'Open in system browser'
    )
  })

  it('reads the modifier per platform', () => {
    expect(opensInSystemBrowser({ shiftKey: true, metaKey: true, ctrlKey: false }, true)).toBe(true)
    expect(opensInSystemBrowser({ shiftKey: true, metaKey: true, ctrlKey: false }, false)).toBe(
      false
    )
    expect(opensInSystemBrowser({ shiftKey: true, metaKey: false, ctrlKey: true }, false)).toBe(
      true
    )
    // Shift alone is text selection, not a browser hand-off.
    expect(opensInSystemBrowser({ shiftKey: true, metaKey: false, ctrlKey: false }, true)).toBe(
      false
    )
  })
})

describe('WebConversationHandOffMenu without a workspace', () => {
  it('explains the refusal instead of opening the picker', async () => {
    render(
      <TooltipProvider>
        <WebConversationHandOffMenu entry={entry} worktreeId={null} />
      </TooltipProvider>
    )

    const trigger = screen.getByTestId('sessions-board-web-card-hand-off')
    expect(trigger.getAttribute('aria-label')).toBe('No workspace selected to hand off to.')

    await userEvent.click(trigger)

    expect(screen.queryByText('Send notes to')).toBeNull()
  })
})
