// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useAppStore } from '@/store'
import type { AiVaultSession } from '../../../../shared/ai-vault-types'
import type { BrowserHistoryEntry } from '../../../../shared/browser-workspace-types'
import type { SessionsBoardCardAvailability } from './sessions-board-card-availability'
import type { SessionsBoardColumn } from './sessions-board-column-model'
import SessionsBoardPage from './SessionsBoardPage'
import { useSessionsBoardCardAvailability } from './use-sessions-board-card-availability'
import { useSessionsBoardColumns, type SessionsBoardData } from './use-sessions-board-columns'
import { useSessionsBoardSessionActions } from './use-sessions-board-session-actions'

vi.mock('./use-sessions-board-columns', () => ({ useSessionsBoardColumns: vi.fn() }))
vi.mock('./use-sessions-board-card-availability', () => ({
  useSessionsBoardCardAvailability: vi.fn()
}))
vi.mock('./use-sessions-board-session-actions', () => ({ useSessionsBoardSessionActions: vi.fn() }))
vi.mock('./SessionsConversationOverlay', () => ({
  SessionsConversationOverlay: ({
    session,
    onClose,
    onJump,
    onResume
  }: {
    session: AiVaultSession
    onClose: () => void
    onJump: () => void
    onResume: () => void
  }) => (
    <div data-testid="overlay">
      <span>{session.title}</span>
      <button type="button" data-testid="overlay-jump" onClick={onJump}>
        jump
      </button>
      <button type="button" data-testid="overlay-resume" onClick={onResume}>
        resume
      </button>
      <button type="button" onClick={onClose}>
        close overlay
      </button>
    </div>
  )
}))

const columnMock = vi.mocked(useSessionsBoardColumns)
const availabilityMock = vi.mocked(useSessionsBoardCardAvailability)
const actionsMock = vi.mocked(useSessionsBoardSessionActions)
const closeSessionsPage = vi.fn()
let previousClose: () => void
let previousWebConversationHistory: BrowserHistoryEntry[]

const availability: SessionsBoardCardAvailability = {
  worktreeInfo: { status: 'active', label: 'orca', path: '/repo/orca', worktreeId: 'wt-1' },
  jumpWorktreeId: 'wt-1',
  resumeWorktreeId: 'wt-1',
  resumeDisabled: false,
  resumeBlocked: false,
  canCopyResumeCommand: true
}

function makeSession(agent: AiVaultSession['agent'], sessionId: string): AiVaultSession {
  return {
    id: `local:${agent}:${sessionId}`,
    executionHostId: 'local',
    agent,
    sessionId,
    title: `${agent} ${sessionId}`,
    cwd: `/home/a/${sessionId}`,
    branch: null,
    model: null,
    filePath: `/home/a/${agent}/${sessionId}.json`,
    codexHome: null,
    createdAt: null,
    updatedAt: '2026-01-01T00:00:00.000Z',
    modifiedAt: '2026-01-01T00:00:00.000Z',
    messageCount: 1,
    totalTokens: 0,
    previewMessages: [],
    queuedMessageCount: 0,
    subagentTranscriptCount: 0,
    resumeCommand: '',
    subagent: null
  }
}

function boardData(overrides: Partial<SessionsBoardData> = {}): SessionsBoardData {
  const columns: SessionsBoardColumn[] = [
    {
      agent: 'claude',
      label: 'Claude',
      sessions: [makeSession('claude', 'c1'), makeSession('claude', 'c2')]
    },
    { agent: 'codex', label: 'Codex', sessions: [makeSession('codex', 'x1')] }
  ]
  return {
    columns,
    sessions: columns.flatMap((column) => column.sessions),
    loading: false,
    error: null,
    scanIssues: 0,
    refresh: vi.fn().mockResolvedValue(undefined),
    ...overrides
  }
}

function webEntry(overrides: Partial<BrowserHistoryEntry> = {}): BrowserHistoryEntry {
  return {
    url: 'https://chatgpt.com/c/abc',
    normalizedUrl: 'https://chatgpt.com/c/abc',
    title: 'Postgres migration plan',
    faviconUrl: null,
    lastVisitedAt: Date.now() - 60_000,
    visitCount: 2,
    ...overrides
  }
}

function renderPage(): void {
  render(
    <TooltipProvider>
      <SessionsBoardPage />
    </TooltipProvider>
  )
}

const jumpToSessionWorkspace = vi.fn()
const resumeSessionInTerminal = vi.fn()

beforeEach(() => {
  closeSessionsPage.mockReset()
  jumpToSessionWorkspace.mockReset()
  resumeSessionInTerminal.mockReset()
  previousClose = useAppStore.getState().closeSessionsPage
  previousWebConversationHistory = useAppStore.getState().webConversationHistory
  useAppStore.setState({ closeSessionsPage, webConversationHistory: [] })
  columnMock.mockReturnValue(boardData())
  // Every session on the board resolves, so the plumbing under test is the wiring, not the
  // availability rules — those are `sessions-board-card-availability.test.ts`.
  availabilityMock.mockImplementation(
    (sessions) => new Map(sessions.map((session) => [session.id, availability]))
  )
  actionsMock.mockReturnValue({ jumpToSessionWorkspace, resumeSessionInTerminal })
})

afterEach(() => {
  cleanup()
  useAppStore.setState({
    closeSessionsPage: previousClose,
    webConversationHistory: previousWebConversationHistory
  })
  columnMock.mockReset()
  availabilityMock.mockReset()
  actionsMock.mockReset()
})

describe('SessionsBoardPage', () => {
  it('renders one column per agent type with its session count', () => {
    renderPage()

    expect(screen.getByTestId('sessions-board-column-claude')).toBeTruthy()
    expect(screen.getByTestId('sessions-board-column-codex')).toBeTruthy()
    expect(screen.getByText('Claude')).toBeTruthy()
    expect(screen.getByText('2')).toBeTruthy()
    expect(screen.getByText('1')).toBeTruthy()
  })

  it('feeds the search box into the column model', async () => {
    renderPage()

    await userEvent.type(screen.getByLabelText('Search sessions'), 'deploy')

    expect(columnMock).toHaveBeenLastCalledWith({ query: 'deploy', hideEmptySessions: true })
  })

  it('toggles the hide-empty filter', async () => {
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: 'Hide empty sessions' }))

    expect(columnMock).toHaveBeenLastCalledWith({ query: '', hideEmptySessions: false })
  })

  it('opens a conversation from a card and closes it with Escape before the page', async () => {
    renderPage()

    await userEvent.click(screen.getAllByTestId('sessions-board-card')[0])
    expect(screen.getByTestId('overlay')).toBeTruthy()

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByTestId('overlay')).toBeNull()
    expect(closeSessionsPage).not.toHaveBeenCalled()

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(closeSessionsPage).toHaveBeenCalledTimes(1)
  })

  it('closes the page from the header button', async () => {
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: 'Close sessions' }))

    expect(closeSessionsPage).toHaveBeenCalledTimes(1)
  })

  it('offers to clear the search when nothing matches it', async () => {
    columnMock.mockReturnValue(boardData({ columns: [] }))
    renderPage()

    expect(screen.getByText('No agent sessions found on this machine.')).toBeTruthy()

    await userEvent.type(screen.getByLabelText('Search sessions'), 'nothing')
    expect(screen.getByText('No sessions match this search.')).toBeTruthy()

    await userEvent.click(screen.getByRole('button', { name: 'Clear search' }))

    expect(screen.getByLabelText('Search sessions')).toHaveProperty('value', '')
  })

  it('reports scan issues without blocking the board', () => {
    columnMock.mockReturnValue(boardData({ scanIssues: 3 }))
    renderPage()

    expect(screen.getByText('Some locations could not be read (3).')).toBeTruthy()
    expect(screen.getByTestId('sessions-board-column-claude')).toBeTruthy()
  })

  it('shows the scan failure with a retry that forces a rescan', async () => {
    const refresh = vi.fn().mockResolvedValue(undefined)
    columnMock.mockReturnValue(boardData({ error: 'host unreachable', refresh }))
    renderPage()

    expect(screen.getByText('The session scan failed: host unreachable')).toBeTruthy()

    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))

    expect(refresh).toHaveBeenCalledWith({ force: true })
  })

  it('routes a card action to the session that card drew', async () => {
    renderPage()

    await userEvent.click(screen.getAllByTestId('sessions-board-card-jump')[0])
    await userEvent.click(screen.getAllByTestId('sessions-board-card-resume')[0])

    expect(jumpToSessionWorkspace.mock.calls[0][0]).toHaveProperty('id', 'local:claude:c1')
    expect(resumeSessionInTerminal.mock.calls[0][0]).toHaveProperty('id', 'local:claude:c1')
  })

  it('offers the same actions inside the open conversation', async () => {
    renderPage()

    await userEvent.click(screen.getAllByTestId('sessions-board-card')[0])
    await userEvent.click(screen.getByTestId('overlay-jump'))
    await userEvent.click(screen.getByTestId('overlay-resume'))

    expect(jumpToSessionWorkspace.mock.calls[0][0]).toHaveProperty('id', 'local:claude:c1')
    expect(resumeSessionInTerminal.mock.calls[0][0]).toHaveProperty('id', 'local:claude:c1')
  })

  it('re-derives availability from the scan, not from the searched columns', async () => {
    renderPage()
    const scan = availabilityMock.mock.calls[0][0]

    await userEvent.type(screen.getByLabelText('Search sessions'), 'c1')

    expect(columnMock).toHaveBeenLastCalledWith({ query: 'c1', hideEmptySessions: true })
    // Same array identity: cwd matching is keyed on it, so a filtered projection here would
    // rebuild the whole session × workspace pass on every keystroke.
    expect(availabilityMock.mock.calls.at(-1)?.[0]).toBe(scan)
  })
})

describe('SessionsBoardPage web conversations', () => {
  it('renders a site column beside the agent columns', () => {
    useAppStore.setState({ webConversationHistory: [webEntry()] })
    renderPage()

    expect(screen.getByTestId('sessions-board-column-claude')).toBeTruthy()
    expect(screen.getByTestId('sessions-board-web-column-chatgpt')).toBeTruthy()
    expect(screen.getByText('Postgres migration plan')).toBeTruthy()
    expect(screen.getByText('ChatGPT')).toBeTruthy()
  })

  it('is not empty when only a web conversation exists', () => {
    columnMock.mockReturnValue(boardData({ columns: [], sessions: [] }))
    useAppStore.setState({ webConversationHistory: [webEntry()] })
    renderPage()

    expect(screen.queryByText('No agent sessions found on this machine.')).toBeNull()
    expect(screen.getByTestId('sessions-board-web-column-chatgpt')).toBeTruthy()
  })

  it('filters the site columns with the same search box', async () => {
    useAppStore.setState({ webConversationHistory: [webEntry()] })
    renderPage()

    await userEvent.type(screen.getByLabelText('Search sessions'), 'nothing matches')

    expect(screen.queryByTestId('sessions-board-web-column-chatgpt')).toBeNull()
  })

  it('collapses a site column without touching the agent columns', async () => {
    useAppStore.setState({ webConversationHistory: [webEntry()] })
    renderPage()

    await userEvent.click(screen.getByText('ChatGPT'))

    expect(screen.getByTestId('sessions-board-web-column-collapsed-chatgpt')).toBeTruthy()
    expect(screen.getByTestId('sessions-board-column-claude')).toBeTruthy()
  })

  it('keeps a site column independent of an agent column that shares its name', async () => {
    // Why this is the regression that matters: `kimi` is both a registered site and a CLI agent, so
    // keying both kinds of column on their bare id made one collapsed set serve two columns —
    // collapsing the site's column folded the agent's, and the rails could not be toggled apart.
    columnMock.mockReturnValue(
      boardData({
        columns: [{ agent: 'kimi', label: 'Kimi', sessions: [makeSession('kimi', 'k1')] }]
      })
    )
    useAppStore.setState({
      webConversationHistory: [webEntry({ url: 'https://kimi.com/chat/1' })]
    })
    renderPage()

    expect(screen.getByTestId('sessions-board-column-kimi')).toBeTruthy()
    expect(screen.getByTestId('sessions-board-web-column-kimi')).toBeTruthy()

    // The two columns share a label, so the click is aimed at the site column's own toggle rather
    // than at the text both of them render.
    const siteColumn = within(screen.getByTestId('sessions-board-web-column-kimi'))
    await userEvent.click(siteColumn.getByRole('button', { expanded: true }))

    expect(screen.getByTestId('sessions-board-web-column-collapsed-kimi')).toBeTruthy()
    expect(screen.getByTestId('sessions-board-column-kimi')).toBeTruthy()
  })

  it('still shows web conversations while the agent scan is running', () => {
    columnMock.mockReturnValue(boardData({ columns: [], sessions: [], loading: true }))
    useAppStore.setState({ webConversationHistory: [webEntry()] })
    renderPage()

    // The scan is machine-wide and slow; the conversation list is already in the store, so waiting
    // on the scan would hide history the board already has.
    expect(screen.getByTestId('sessions-board-web-column-chatgpt')).toBeTruthy()
  })

  it('still shows web conversations when the agent scan fails', () => {
    columnMock.mockReturnValue(boardData({ columns: [], sessions: [], error: 'host unreachable' }))
    useAppStore.setState({ webConversationHistory: [webEntry()] })
    renderPage()

    // The failure is the scan's, not the browsing history's: the notice says so, and the site
    // columns stay reachable underneath it.
    expect(screen.getByText(/session scan failed/)).toBeTruthy()
    expect(screen.getByTestId('sessions-board-web-column-chatgpt')).toBeTruthy()
  })

  it('offers a new chat on every registered site from the header', async () => {
    columnMock.mockReturnValue(boardData({ columns: [], sessions: [] }))
    renderPage()

    await userEvent.click(screen.getByTestId('sessions-board-new-web-conversation'))

    // The menu is the only entry point for a site that has never been visited — which is exactly
    // the site a new chat is for — so it lists the registry rather than the history.
    expect(screen.getByTestId('sessions-board-new-web-conversation-chatgpt')).toBeTruthy()
    expect(screen.getByTestId('sessions-board-new-web-conversation-deepseek')).toBeTruthy()
    expect(screen.getByTestId('sessions-board-new-web-conversation-kimi')).toBeTruthy()
  })

  it('offers the same thing from a site column’s own header', () => {
    useAppStore.setState({ webConversationHistory: [webEntry()] })
    renderPage()

    expect(screen.getByTestId('sessions-board-web-column-new-chatgpt')).toBeTruthy()
  })
})
