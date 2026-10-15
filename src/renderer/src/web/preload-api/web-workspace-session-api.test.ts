// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BrowserHistoryEntry } from '../../../../shared/browser-workspace-types'
import { createWebWorkspaceSessionApi } from './web-workspace-session-api'
import { SESSION_STORAGE_KEY } from './web-storage'

// Why mutable and hoisted: the paired and unpaired reads are the same function, and which one it
// takes is decided entirely by whether an environment is stored.
const runtime = vi.hoisted(() => ({ paired: false, environment: { id: 'host-1' } }))
vi.mock('./web-runtime-session', () => ({
  webRuntimeState: { activeEnvironment: null },
  requireActiveEnvironmentOrNull: () => (runtime.paired ? runtime.environment : null)
}))
vi.mock('./web-preferences-store', () => ({
  readLocalWebUIState: () => ({
    lastActiveRepoId: 'repo-from-host',
    lastActiveWorktreeId: 'wt-from-host'
  })
}))

function conversation(
  url: string,
  overrides: Partial<BrowserHistoryEntry> = {}
): BrowserHistoryEntry {
  return {
    url,
    normalizedUrl: url,
    title: 'A conversation',
    faviconUrl: null,
    lastVisitedAt: 1_700_000_000_000,
    visitCount: 1,
    ...overrides
  }
}

function storedSession(): Record<string, unknown> {
  return JSON.parse(window.localStorage.getItem(SESSION_STORAGE_KEY) ?? '{}')
}

beforeEach(() => {
  window.localStorage.clear()
  runtime.paired = false
})

describe('createWebWorkspaceSessionApi history persistence', () => {
  it('keeps both history lists when an unrelated field is patched while paired', async () => {
    // Why this is the regression that matters: while paired, the read path rebuilds the session
    // from the host's UI state so browser-local terminal handles are never replayed. `patch` writes
    // `{ ...getStoredWorkspaceSession(), ...patch }`, so anything the rebuild *dropped* was
    // persisted over what was stored by the next unrelated write — which emptied the paired
    // client's sessions board and its address-bar history at once.
    const browserUrlHistory = [conversation('https://example.com/docs')]
    const webConversationHistory = [conversation('https://chat.deepseek.com/a/chat/s/abc')]
    window.localStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({ browserUrlHistory, webConversationHistory })
    )
    runtime.paired = true
    const sessionApi = createWebWorkspaceSessionApi().session
    if (!sessionApi?.patch) {
      throw new Error('the web session api must expose patch')
    }

    await sessionApi.patch({ activeRepoId: 'repo-2' })

    // The rebuild still does its job: the handle-bearing fields come from the host.
    expect(storedSession()).toMatchObject({
      activeRepoId: 'repo-2',
      browserUrlHistory,
      webConversationHistory
    })
  })

  it('reads a stored conversation back while paired', async () => {
    const webConversationHistory = [conversation('https://kimi.com/chat/abc')]
    window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ webConversationHistory }))
    runtime.paired = true

    const session = createWebWorkspaceSessionApi().session

    // The pairing rebuild is what a board read goes through, so the list has to survive it and not
    // only the patch path above.
    await expect(session?.get?.()).resolves.toMatchObject({
      activeRepoId: 'repo-from-host',
      webConversationHistory
    })
  })

  it('reads a stored conversation back while unpaired', async () => {
    const webConversationHistory = [conversation('https://kimi.com/chat/abc')]
    window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ webConversationHistory }))

    const session = createWebWorkspaceSessionApi().session

    await expect(session?.get?.()).resolves.toMatchObject({ webConversationHistory })
  })
})
