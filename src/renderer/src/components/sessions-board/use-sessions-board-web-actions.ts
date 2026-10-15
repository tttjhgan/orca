import { useCallback } from 'react'
import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { useActiveWorktree } from '@/store/selectors'
import { translate } from '@/i18n/i18n'
import { openWorkspaceBrowserTab } from '@/lib/workspace-browser-tab-open'

export type SessionsBoardWebActions = {
  /** The worktree a browser tab would open in, or null when none is active. */
  worktreeId: string | null
  openUrl: (url: string) => void
  openUrlInSystemBrowser: (url: string) => void
  copyUrl: (url: string) => void
}

/**
 * Where a web conversation card's URL goes: a tab in Orca's browser, or the system browser.
 *
 * Why the system browser gets its own action rather than only a modifier: Orca's browser has its
 * own cookie partition, so the first visit to a site may well land logged out — the escape hatch
 * has to be visible, not just documented.
 */
export function useSessionsBoardWebActions(): SessionsBoardWebActions {
  const activeWorktree = useActiveWorktree()
  const closeSessionsPage = useAppStore((state) => state.closeSessionsPage)
  const setActiveView = useAppStore((state) => state.setActiveView)
  const worktreeId = activeWorktree?.id ?? null

  const openUrl = useCallback(
    (url: string): void => {
      if (!worktreeId) {
        // The same refusal, and the same translated sentence, the ports panel gives for a URL it
        // cannot open. Unlike resuming an agent, this is not a fallback the board is entitled to
        // refuse: a URL carries its own context and belongs to no directory, so the only question
        // is which tab strip shows it — and the one you are looking at is the right answer.
        toast.error(
          translate(
            'auto.components.right.sidebar.PortsPanel.409afcc145',
            'No workspace selected for the browser.'
          )
        )
        return
      }
      // Why the page closes: the browser tab lives in the workbench view this page replaced, so
      // without this the tab would open behind the board. The action asked for is "go to the
      // conversation", not "open it somewhere you cannot see".
      closeSessionsPage()
      // Why the second call: closing restores whatever page the board was opened from, which is
      // the workbench in the common case but need not be — the board is also reachable from the
      // task and settings pages. The tab strip is the terminal view, so the destination is stated
      // rather than inferred. Same call `activateAndRevealWorktree` makes to land on the workbench.
      setActiveView('terminal')
      void openWorkspaceBrowserTab({
        workspaceId: worktreeId,
        url,
        intent: { kind: 'url' }
      }).catch((error) => {
        toast.error(error instanceof Error ? error.message : String(error))
      })
    },
    [closeSessionsPage, setActiveView, worktreeId]
  )

  const openUrlInSystemBrowser = useCallback((url: string): void => {
    void window.api.shell.openUrl(url)
  }, [])

  const copyUrl = useCallback((url: string): void => {
    void window.api.ui.writeClipboardText(url)
  }, [])

  return { worktreeId, openUrl, openUrlInSystemBrowser, copyUrl }
}
