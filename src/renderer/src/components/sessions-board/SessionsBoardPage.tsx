import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2, RefreshCw, TriangleAlert, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import type { AiVaultSession } from '../../../../shared/ai-vault-types'
import { SessionsBoardColumn } from './SessionsBoardColumn'
import { SessionsBoardNewConversationMenu } from './SessionsBoardNewConversationMenu'
import { SessionsBoardWebColumn } from './SessionsBoardWebColumn'
import { SessionsConversationOverlay } from './SessionsConversationOverlay'
import { buildSessionsBoardWebColumns } from './sessions-board-web-columns'
import { useSessionsBoardCardAvailability } from './use-sessions-board-card-availability'
import { useSessionsBoardColumns } from './use-sessions-board-columns'
import { useSessionsBoardSessionActions } from './use-sessions-board-session-actions'
import { useSessionsBoardWebActions } from './use-sessions-board-web-actions'

// Why a module constant: an empty Set literal would be a new identity each render and
// restart any consumer keyed on it. Keyed by `SessionsBoardColumn.agent` for an agent
// column and by `SessionsBoardWebColumn.columnKey` for a web one — which is namespaced,
// because an agent id and a site id can be the same string.
const EMPTY_SET: ReadonlySet<string> = new Set()

/**
 * Every agent session on this machine, one column per agent type — and, beside them, one column
 * per web AI site the user has talked to in Orca's own browser, so a conversation held with a web
 * AI is findable on the same board as the agents it might be handed to.
 */
export default function SessionsBoardPage(): React.JSX.Element {
  const closeSessionsPage = useAppStore((state) => state.closeSessionsPage)
  const [query, setQuery] = useState('')
  const [hideEmptySessions, setHideEmptySessions] = useState(true)
  const [collapsedColumns, setCollapsedColumns] = useState<ReadonlySet<string>>(EMPTY_SET)
  const [openSession, setOpenSession] = useState<AiVaultSession | null>(null)
  const { columns, sessions, loading, error, scanIssues, refresh } = useSessionsBoardColumns({
    query,
    hideEmptySessions
  })
  const webConversationHistory = useAppStore((state) => state.webConversationHistory)
  // Why a separate selector and not the session scan: this list is machine-wide browsing state
  // that changes as pages are visited, and folding it into `useSessionsBoardColumns` would re-run
  // the agent scan behind every unrelated page load.
  const webColumns = useMemo(
    () => buildSessionsBoardWebColumns(webConversationHistory, { query }),
    [query, webConversationHistory]
  )
  const webActions = useSessionsBoardWebActions()
  // Why the raw `sessions` and not `columns`: availability is keyed on that array's identity,
  // so deriving it from the filtered columns would re-run cwd matching on every keystroke.
  const availabilityById = useSessionsBoardCardAvailability(sessions)
  const { jumpToSessionWorkspace, resumeSessionInTerminal } = useSessionsBoardSessionActions({
    availabilityById
  })

  const onCopy = useCallback((text: string): void => {
    void window.api.ui.writeClipboardText(text)
  }, [])

  const toggleCollapsed = useCallback((columnKey: string): void => {
    setCollapsedColumns((current) => {
      const next = new Set(current)
      if (!next.delete(columnKey)) {
        next.add(columnKey)
      }
      return next
    })
  }, [])

  // Why: the overlay is the topmost surface, so Escape peels it before the page.
  const closeTopmost = useCallback((): void => {
    if (openSession) {
      setOpenSession(null)
      return
    }
    closeSessionsPage()
  }, [openSession, closeSessionsPage])

  usePageEscape(closeTopmost)

  const isSearching = query.trim().length > 0
  // The agent half's own state, which is not the whole board's: the scan is machine-wide and
  // deliberately uncapped, so it is slow on a busy machine and can fail on one directory.
  const scanPending = loading && columns.length === 0
  const agentColumnsVisible = !error && !scanPending
  // A web column only exists once its site has a conversation, so an empty board still reaches the
  // empty state even with the registry fully populated.
  const isEmpty = !loading && !error && columns.length === 0 && webColumns.length === 0

  return (
    <main className="relative flex h-full min-h-0 flex-1 flex-col bg-background pt-5 text-foreground md:pt-6">
      <header
        className="flex shrink-0 flex-col gap-2 px-3 pb-3 md:px-5"
        // Why: no stacked center titlebar on this page; keep the header clear of the Windows/Linux window controls.
        style={{ paddingRight: 'max(0.75rem, var(--window-controls-width, 0px))' }}
      >
        <div className="flex items-center gap-2">
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold leading-8">
              {translate('sessionsBoard.title', 'Sessions')}
            </h1>
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <SessionsBoardNewConversationMenu actions={webActions} />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => void refresh({ force: true })}
                  disabled={loading}
                  aria-label={translate('sessionsBoard.refresh', 'Rescan sessions')}
                >
                  <RefreshCw className={loading ? 'size-4 animate-spin' : 'size-4'} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={4}>
                {translate('sessionsBoard.refresh', 'Rescan sessions')}
              </TooltipContent>
            </Tooltip>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={closeSessionsPage}
              aria-label={translate('sessionsBoard.close', 'Close sessions')}
            >
              <X className="size-4" />
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={translate('sessionsBoard.search', 'Search sessions')}
            aria-label={translate('sessionsBoard.search', 'Search sessions')}
            className="h-8 w-full max-w-xs"
          />
          <Button
            type="button"
            variant={hideEmptySessions ? 'secondary' : 'ghost'}
            size="sm"
            aria-pressed={hideEmptySessions}
            onClick={() => setHideEmptySessions((current) => !current)}
          >
            {translate('sessionsBoard.hideEmpty', 'Hide empty sessions')}
          </Button>
        </div>
      </header>

      {/* Why the notice no longer replaces the board: the web conversation half is browsing
          history that owes nothing to the agent scan, and a failed scan used to put it out of
          reach. The banner states the failure; the columns that can still be drawn are drawn. */}
      {error ? (
        <BoardNotice
          message={translate('sessionsBoard.loadFailed', 'The session scan failed: {{error}}', {
            error
          })}
          onRetry={() => void refresh({ force: true })}
        />
      ) : null}

      {(agentColumnsVisible && columns.length > 0) || webColumns.length > 0 ? (
        <div className="scrollbar-sleek flex min-h-0 flex-1 items-stretch overflow-x-auto p-3">
          {/* items-stretch is what bounds each column, so its card list — not the page — scrolls. */}
          <div className="mx-auto flex w-full max-w-[1600px] items-stretch gap-3">
            {agentColumnsVisible
              ? columns.map((column) => (
                  <SessionsBoardColumn
                    key={column.agent}
                    column={column}
                    collapsed={collapsedColumns.has(column.agent)}
                    availabilityById={availabilityById}
                    onToggleCollapsed={() => toggleCollapsed(column.agent)}
                    onOpenSession={setOpenSession}
                    onCopy={onCopy}
                    onJumpToWorkspace={jumpToSessionWorkspace}
                    onResume={resumeSessionInTerminal}
                  />
                ))
              : null}
            {/* Why after the agent columns: the agent half is what the board was built for, and a
                site's conversations are the ones being handed *to* it. */}
            {webColumns.map((column) => (
              <SessionsBoardWebColumn
                key={column.siteId}
                column={column}
                collapsed={collapsedColumns.has(column.columnKey)}
                onToggleCollapsed={() => toggleCollapsed(column.columnKey)}
                actions={webActions}
              />
            ))}
          </div>
        </div>
      ) : scanPending ? (
        <div className="flex min-h-0 flex-1 items-center justify-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          {translate('sessionsBoard.loading', 'Reading every agent session on this machine…')}
        </div>
      ) : isEmpty ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <p className="text-sm text-muted-foreground">
            {isSearching
              ? translate('sessionsBoard.empty.noMatches', 'No sessions match this search.')
              : translate('sessionsBoard.empty.none', 'No agent sessions found on this machine.')}
          </p>
          {isSearching ? (
            <Button type="button" variant="outline" size="xs" onClick={() => setQuery('')}>
              {translate('sessionsBoard.empty.clearSearch', 'Clear search')}
            </Button>
          ) : null}
        </div>
      ) : null}

      {scanIssues > 0 && !error ? (
        <p className="shrink-0 px-3 pb-2 text-2xs text-muted-foreground/80 md:px-5">
          {translate('sessionsBoard.scanIssues', 'Some locations could not be read ({{count}}).', {
            count: scanIssues
          })}
        </p>
      ) : null}

      {openSession ? (
        <SessionsConversationOverlay
          session={openSession}
          availability={availabilityById.get(openSession.id) ?? null}
          onClose={() => setOpenSession(null)}
          onCopy={onCopy}
          onJump={() => jumpToSessionWorkspace(openSession)}
          onResume={() => resumeSessionInTerminal(openSession)}
        />
      ) : null}
    </main>
  )
}

function BoardNotice({
  message,
  onRetry
}: {
  message: string
  onRetry: () => void
}): React.JSX.Element {
  return (
    <div className="mx-3 mb-3 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs leading-5 md:mx-5">
      <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-destructive" />
      <span className="min-w-0 flex-1">{message}</span>
      <Button type="button" variant="ghost" size="xs" onClick={onRetry}>
        {translate('sessionsBoard.conversation.retry', 'Retry')}
      </Button>
    </div>
  )
}

function isEditableElement(target: EventTarget | null): target is HTMLElement {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  )
}

/** Esc leaves a field before it leaves the page, so typing never costs the reader the view. */
function usePageEscape(onClose: () => void): void {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key !== 'Escape' || event.defaultPrevented) {
        return
      }
      const target = event.target
      event.preventDefault()
      // Why no "must be an element" guard: with nothing focused the target is the
      // window itself, which must still close the page.
      if (isEditableElement(target)) {
        target.blur()
        return
      }
      onClose()
    }
    // Why bubble phase: Radix popovers and menus consume their own Escape first.
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])
}
