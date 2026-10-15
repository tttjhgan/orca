// @vitest-environment happy-dom

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { BrowserHistoryEntry } from '../../../../shared/browser-workspace-types'
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
