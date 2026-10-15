// @vitest-environment happy-dom

import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { openWorkspaceBrowserTab } from '@/lib/workspace-browser-tab-open'
import { useSessionsBoardWebActions } from './use-sessions-board-web-actions'

const activeWorktree = vi.hoisted((): { value: { id: string } | undefined } => ({
  value: undefined
}))
vi.mock('@/store/selectors', () => ({ useActiveWorktree: () => activeWorktree.value }))
vi.mock('@/lib/workspace-browser-tab-open', () => ({ openWorkspaceBrowserTab: vi.fn() }))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), message: vi.fn() } }))

const openTab = vi.mocked(openWorkspaceBrowserTab)
const openUrl = vi.fn().mockResolvedValue(undefined)
const writeClipboardText = vi.fn().mockResolvedValue(undefined)
const closeSessionsPage = vi.fn()
const setActiveView = vi.fn()

let previousApi: Window['api']
let previousCloseSessionsPage: () => void
let previousSetActiveView: ReturnType<typeof useAppStore.getState>['setActiveView']

/** Only this hook's slice of the bridge exists under test, so it is defined rather than cast. */
function setWindowApi(api: unknown): void {
  Object.defineProperty(window, 'api', { value: api, configurable: true, writable: true })
}

beforeEach(() => {
  openTab.mockReset()
  openTab.mockResolvedValue(null)
  openUrl.mockClear()
  writeClipboardText.mockClear()
  closeSessionsPage.mockClear()
  setActiveView.mockClear()
  activeWorktree.value = { id: 'wt-1' }
  previousApi = window.api
  setWindowApi({ shell: { openUrl }, ui: { writeClipboardText } })
  previousCloseSessionsPage = useAppStore.getState().closeSessionsPage
  previousSetActiveView = useAppStore.getState().setActiveView
  useAppStore.setState({ closeSessionsPage, setActiveView })
})

afterEach(() => {
  cleanup()
  setWindowApi(previousApi)
  useAppStore.setState({
    closeSessionsPage: previousCloseSessionsPage,
    setActiveView: previousSetActiveView
  })
})

function mount() {
  return renderHook(() => useSessionsBoardWebActions())
}

describe('useSessionsBoardWebActions', () => {
  it('opens the URL as a tab and leaves the board, so the tab is actually seen', () => {
    const { result } = mount()

    act(() => result.current.openUrl('https://chatgpt.com/c/abc'))

    // Why the page closes: a browser tab lives in the workbench view this page replaced.
    expect(closeSessionsPage).toHaveBeenCalledTimes(1)
    // …and why the view is stated rather than restored: the board is also reachable from the task
    // and settings pages, where closing it would land somewhere the tab strip is not.
    expect(setActiveView).toHaveBeenCalledWith('terminal')
    expect(openTab).toHaveBeenCalledWith({
      workspaceId: 'wt-1',
      url: 'https://chatgpt.com/c/abc',
      intent: { kind: 'url' }
    })
  })

  it('refuses with the browser’s own sentence when no workspace is selected', () => {
    activeWorktree.value = undefined
    const { result } = mount()

    act(() => result.current.openUrl('https://chatgpt.com/c/abc'))

    expect(toast.error).toHaveBeenCalledWith('No workspace selected for the browser.')
    expect(openTab).not.toHaveBeenCalled()
    expect(closeSessionsPage).not.toHaveBeenCalled()
    expect(setActiveView).not.toHaveBeenCalled()
  })

  it('reports a failed tab open instead of leaving the click silent', async () => {
    openTab.mockRejectedValue(new Error('host unreachable'))
    const { result } = mount()

    await act(async () => result.current.openUrl('https://chatgpt.com/c/abc'))

    expect(toast.error).toHaveBeenCalledWith('host unreachable')
  })

  it('hands the URL to the system browser when asked for it', () => {
    const { result } = mount()

    act(() => result.current.openUrlInSystemBrowser('https://chatgpt.com/c/abc'))

    expect(openUrl).toHaveBeenCalledWith('https://chatgpt.com/c/abc')
    // Why it does not close the board: nothing opened in Orca, so there is nothing to go and see.
    expect(closeSessionsPage).not.toHaveBeenCalled()
  })

  it('copies the URL without opening anything', () => {
    const { result } = mount()

    act(() => result.current.copyUrl('https://chatgpt.com/c/abc'))

    expect(writeClipboardText).toHaveBeenCalledWith('https://chatgpt.com/c/abc')
    expect(openTab).not.toHaveBeenCalled()
    expect(openUrl).not.toHaveBeenCalled()
  })

  it('exposes the worktree the hand-off menu needs, and null when there is none', () => {
    const withWorktree = mount()
    expect(withWorktree.result.current.worktreeId).toBe('wt-1')
    cleanup()

    activeWorktree.value = undefined
    const withoutWorktree = mount()
    expect(withoutWorktree.result.current.worktreeId).toBeNull()
  })
})
