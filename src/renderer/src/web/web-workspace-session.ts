import { getDefaultWorkspaceSession } from '../../../shared/constants'
import type { WorkspaceSessionState } from '../../../shared/workspace-session-state-types'

export function sanitizeWebRuntimeWorkspaceSession(
  session: WorkspaceSessionState
): WorkspaceSessionState {
  const defaults = getDefaultWorkspaceSession()
  return {
    ...defaults,
    // Why: paired web clients get live tabs from the host runtime. Persisting
    // those remote handles in browser storage replays stale terminal/browser
    // selectors after a new pairing or host restart.
    activeRepoId: session.activeRepoId ?? null,
    activeWorktreeId: session.activeWorktreeId ?? null,
    browserUrlHistory: session.browserUrlHistory ?? defaults.browserUrlHistory,
    // Why carried like the browsing list above: this is browsing history, not a remote handle, so
    // there is nothing in it that a new pairing must not replay. `getStoredWorkspaceSession` is
    // what keeps it across a boot; this is only the sanitizer saying the field is allowed through.
    webConversationHistory: session.webConversationHistory ?? defaults.webConversationHistory,
    lastVisitedAtByWorktreeId: session.lastVisitedAtByWorktreeId
  }
}
