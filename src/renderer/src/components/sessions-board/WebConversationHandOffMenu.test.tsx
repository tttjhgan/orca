// @vitest-environment happy-dom

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { BrowserHistoryEntry, BrowserPage } from '../../../../shared/browser-workspace-types'
import type { BrowserReadPageTextResult } from '../../../../shared/browser-page-text'
import type { OpenAgentSendPopoverTargetModeArgs } from '@/store/slices/ui'
import { createTestStore } from '@/store/slices/browser-slice-test-harness'
import { WebConversationHandOffMenu } from './WebConversationHandOffMenu'

const state = vi.hoisted((): { store?: ReturnType<typeof createTestStore> } => ({}))
vi.mock('@/store', () => ({
  useAppStore: (
    selector: (value: ReturnType<ReturnType<typeof createTestStore>['getState']>) => unknown
  ) => {
    if (!state.store) {
      throw new Error('Missing test store')
    }
    return state.store(selector)
  }
}))
// Why the picker is stubbed and its props asserted instead of rendered: the real content reads
// most of the app store to enumerate running agents, which this browser-only test store does not
// carry. What this file is responsible for is the prompt and the launch source it hands over.
const picker = vi.hoisted((): { props?: Record<string, unknown> } => ({}))
vi.mock('@/components/editor/ReviewNotesSendMenuContent', () => ({
  ReviewNotesSendMenuContent: (props: Record<string, unknown>) => {
    picker.props = props
    return <div data-testid="agent-picker" />
  }
}))

const entry: BrowserHistoryEntry = {
  url: 'https://chatgpt.com/c/abc',
  normalizedUrl: 'https://chatgpt.com/c/abc',
  title: 'Kubernetes rollout notes',
  faviconUrl: null,
  lastVisitedAt: Date.now(),
  visitCount: 1
}

const targetModeId = 'web-conversation:https://chatgpt.com/c/abc'
let store: ReturnType<typeof createTestStore>
let opened: OpenAgentSendPopoverTargetModeArgs | undefined
const closedIds: string[] = []

beforeEach(() => {
  store = createTestStore()
  state.store = store
  opened = undefined
  picker.props = undefined
  closedIds.length = 0
  store.setState({
    activeGroupIdByWorktree: { 'folder-1': 'group-1' },
    // Faithful to the real action in the one respect this menu depends on: opening publishes the
    // target mode, and the menu is only open while that mode is the active one.
    openAgentSendPopoverTargetMode: (args) => {
      opened = args
      store.setState({
        agentSendPopoverTargetMode: {
          ...args,
          instanceId: 'instance-1',
          eligiblePaneKeys: [],
          disabledPaneKeys: {},
          status: 'open'
        }
      })
    },
    closeAgentSendPopoverTargetMode: (id) => {
      if (id) {
        closedIds.push(id)
      }
      store.setState({ agentSendPopoverTargetMode: null })
    }
  })
})

afterEach(cleanup)

async function openMenu(shown: BrowserHistoryEntry = entry): Promise<void> {
  render(
    <TooltipProvider>
      <WebConversationHandOffMenu entry={shown} worktreeId="folder-1" />
    </TooltipProvider>
  )
  await userEvent.click(screen.getByTestId('sessions-board-web-card-hand-off'))
}

describe('WebConversationHandOffMenu', () => {
  it('claims the card’s conversation as its own send target', async () => {
    await openMenu()

    expect(opened?.worktreeId).toBe('folder-1')
    expect(opened?.source).toBe('web-conversation')
    // Why its own launch source: the send is its own surface in telemetry, not a diff-notes or
    // browser-annotation send wearing another name.
    expect(opened?.launchSource).toBe('web_conversation_send')
    expect(opened?.id).toBe(targetModeId)
  })

  it('claims one target for a conversation however it was reached', async () => {
    // Kimi tags the link you arrived by rather than the conversation, so the same chat entered from
    // the home page is a different URL. A target per URL would let two cards in one column claim the
    // same conversation at once, which is the failure the list itself was deduped over.
    await openMenu({
      ...entry,
      url: 'https://chatgpt.com/c/abc?chat_enter_method=home',
      normalizedUrl: 'https://chatgpt.com/c/abc?chat_enter_method=home'
    })

    expect(opened?.id).toBe(targetModeId)
  })

  it('hands the picker a prompt naming the page, its title and how to read it', async () => {
    await openMenu()

    expect(screen.getByTestId('agent-picker')).toBeTruthy()
    const prompt = String(picker.props?.prompt)
    expect(prompt).toContain('https://chatgpt.com/c/abc')
    expect(prompt).toContain('Kubernetes rollout notes')
    expect(prompt).toContain('ORCA snapshot --json')
    expect(picker.props?.worktreeId).toBe('folder-1')
    expect(picker.props?.groupId).toBe('group-1')
    expect(picker.props?.launchSource).toBe('web_conversation_send')
  })

  it('falls back to the worktree as the group when none is active', async () => {
    store.setState({ activeGroupIdByWorktree: {} })

    await openMenu()

    // The quick-launch path needs a group to create the pane in; the worktree is its own group
    // when none is selected, which is the fallback the browser-annotation menu uses too.
    expect(picker.props?.groupId).toBe('folder-1')
  })

  it('releases its target when the menu closes', async () => {
    await openMenu()
    await userEvent.keyboard('{Escape}')

    expect(closedIds).toContain(targetModeId)
    expect(screen.queryByTestId('agent-picker')).toBeNull()
  })

  it('releases its target when the card unmounts', async () => {
    await openMenu()

    cleanup()

    expect(closedIds).toContain(targetModeId)
  })
})

/**
 * The page-text half of the menu: attaching is only possible while a tab is showing the
 * conversation, and it is the tab's own text that goes into the prompt.
 */
describe('WebConversationHandOffMenu page text', () => {
  const readPageText = vi.fn()
  let previousApi: Window['api']

  function conversationPage(overrides: Partial<BrowserPage> = {}): BrowserPage {
    return {
      id: 'page-1',
      workspaceId: 'ws-1',
      worktreeId: 'folder-1',
      url: entry.url,
      title: entry.title,
      loading: false,
      faviconUrl: null,
      canGoBack: false,
      canGoForward: false,
      loadError: null,
      createdAt: 1_700_000_000_000,
      ...overrides
    }
  }

  /** Only this menu's slice of the bridge exists under test, so it is defined rather than cast. */
  function setWindowApi(api: unknown): void {
    Object.defineProperty(window, 'api', { value: api, configurable: true, writable: true })
  }

  function showing(page: BrowserPage): void {
    store.setState({ browserPagesByWorkspace: { 'folder-1': [page] } })
  }

  function answering(result: BrowserReadPageTextResult): void {
    readPageText.mockResolvedValue(result)
  }

  const attachedPage = {
    url: entry.url,
    title: entry.title,
    text: 'Assistant: roll the deployment back first.',
    truncated: false
  }

  beforeEach(() => {
    readPageText.mockReset()
    previousApi = window.api
    setWindowApi({ browser: { readPageText } })
  })

  afterEach(() => {
    setWindowApi(previousApi)
  })

  it('offers the attach row only as a refusal while no tab shows the conversation', async () => {
    await openMenu()

    // Why disabled and not absent: the row is where the reader looks for the feature, and the hint
    // underneath is what tells them how to get it.
    const row = screen.getByTestId('sessions-board-web-card-attach')
    expect(row.getAttribute('data-disabled')).not.toBeNull()
    expect(screen.getByText(/Open this conversation in Orca.s browser/)).toBeTruthy()
  })

  it('reads the tab showing the conversation and quotes what it says', async () => {
    showing(conversationPage())
    answering({ ok: true, page: attachedPage })
    await openMenu()

    await userEvent.click(screen.getByTestId('sessions-board-web-card-attach'))

    expect(readPageText).toHaveBeenCalledWith({ browserPageId: 'page-1' })
    const attachment = await screen.findByTestId('sessions-board-web-card-attachment')
    expect(attachment.textContent).toContain('roll the deployment back first')
    // Why the picker and not a preview of our own: what matters is what the agent is handed.
    const prompt = String(picker.props?.prompt)
    expect(prompt).toContain('Assistant: roll the deployment back first.')
    expect(prompt).not.toContain('ORCA snapshot --json')
  })

  it('takes the attachment back when the reader removes it', async () => {
    showing(conversationPage())
    answering({ ok: true, page: attachedPage })
    await openMenu()
    await userEvent.click(screen.getByTestId('sessions-board-web-card-attach'))
    await screen.findByTestId('sessions-board-web-card-attachment')

    await userEvent.click(screen.getByTestId('sessions-board-web-card-attach-remove'))

    expect(screen.queryByTestId('sessions-board-web-card-attachment')).toBeNull()
    // And the prompt goes back to telling the agent to read the page for itself.
    expect(String(picker.props?.prompt)).toContain('ORCA snapshot --json')
  })

  it('says the page could not be read rather than attaching nothing', async () => {
    showing(conversationPage())
    answering({ ok: false, reason: 'unavailable' })
    await openMenu()

    await userEvent.click(screen.getByTestId('sessions-board-web-card-attach'))

    const error = await screen.findByTestId('sessions-board-web-card-attach-error')
    expect(error.textContent).toContain('The page could not be read.')
    expect(screen.queryByTestId('sessions-board-web-card-attachment')).toBeNull()
    // The row is still there to try again with.
    expect(
      screen.getByTestId('sessions-board-web-card-attach').getAttribute('data-disabled')
    ).toBeNull()
  })

  it('refuses the text when the tab navigated away while the read ran', async () => {
    showing(conversationPage())
    answering({
      ok: true,
      page: { ...attachedPage, url: 'https://chatgpt.com/c/something-else' }
    })
    await openMenu()

    await userEvent.click(screen.getByTestId('sessions-board-web-card-attach'))

    // Why this is its own refusal: attaching another page's words to this prompt would be worse
    // than attaching none, and nothing else would notice it happened.
    const error = await screen.findByTestId('sessions-board-web-card-attach-error')
    expect(error.textContent).toContain('The tab moved on before its text could be read.')
    expect(String(picker.props?.prompt)).not.toContain('roll the deployment back first')
  })

  it('does not offer a document page as the conversation', async () => {
    showing(
      conversationPage({
        url: '',
        docLocation: { kind: 'workspace-doc', worktreeId: 'folder-1', filePath: 'notes.md' }
      })
    )

    await openMenu()

    expect(
      screen.getByTestId('sessions-board-web-card-attach').getAttribute('data-disabled')
    ).not.toBeNull()
  })
})
