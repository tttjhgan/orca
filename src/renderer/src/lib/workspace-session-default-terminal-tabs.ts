import type { WorkspaceSessionState } from '../../../shared/workspace-session-state-types'

/**
 * Why one function: the full payload and the incremental patch both omit this map when it is empty —
 * an omitted map reads as "never stamped" (see unionWriteOnceDefaultTerminalTabsApplied in
 * main/persistence/runtime-authored-workspace-session-fields.ts) — and two copies of that rule drift.
 * Lives beside the other single-field builders rather than inline in buildWorkspaceSessionPayload.
 */
export function buildDefaultTerminalTabsAppliedByWorktreeId(snapshot: {
  defaultTerminalTabsAppliedByWorktreeId: WorkspaceSessionState['defaultTerminalTabsAppliedByWorktreeId']
}): WorkspaceSessionState['defaultTerminalTabsAppliedByWorktreeId'] {
  return snapshot.defaultTerminalTabsAppliedByWorktreeId &&
    Object.keys(snapshot.defaultTerminalTabsAppliedByWorktreeId).length > 0
    ? snapshot.defaultTerminalTabsAppliedByWorktreeId
    : undefined
}
