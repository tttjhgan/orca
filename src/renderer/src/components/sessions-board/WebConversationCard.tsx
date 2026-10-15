import { Copy, ExternalLink } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { formatUiRelativeTime } from '@/i18n/relative-time-format'
import { useNow } from '@/hooks/use-now'
import { BrowserFavicon } from '@/components/browser-favicon'
import { cn } from '@/lib/utils'
import { getPortSystemBrowserHint } from '@/lib/workspace-port-actions'
import type { BrowserHistoryEntry } from '../../../../shared/browser-workspace-types'
import { ACTIONS_CLUSTER_CLASS } from './SessionsBoardCard'
import { ActionButton } from './SessionsBoardSessionActions'

// Why its own card rather than a widened `SessionsBoardCard`: an agent card renders a transcript
// tail and reads fields (agent, previewMessages, messageCount, model, cwd, resumeCommand,
// sessionId, filePath) that a web entry simply does not have, and merging the two record types
// into one list would run the agent card's cwd matching over entries it can never satisfy. The
// two share the presentation vocabulary instead — the cluster class and the action button.

function isMacShortcutPlatform(): boolean {
  return typeof navigator !== 'undefined' && navigator.userAgent.includes('Mac')
}

/** Shift+Cmd/Ctrl is the system-browser escape hatch, the same gesture port links use. */
export function opensInSystemBrowser(
  event: Pick<MouseEvent, 'shiftKey' | 'metaKey' | 'ctrlKey'>,
  isMac: boolean
): boolean {
  return event.shiftKey && (isMac ? event.metaKey : event.ctrlKey)
}

export function WebConversationCard({
  entry,
  onOpen,
  onOpenInSystemBrowser,
  onCopyLink,
  handOffMenu
}: {
  entry: BrowserHistoryEntry
  onOpen: () => void
  onOpenInSystemBrowser: () => void
  onCopyLink: () => void
  /** The send control, injected rather than built here: it owns a picker that reads the store, and
   *  keeping it out leaves this card a pure function of its props. */
  handOffMenu: React.ReactNode
}): React.JSX.Element {
  const isMac = isMacShortcutPlatform()
  // Why the hook and not `Date.now()` in the label: a relative time read during render makes the
  // render impure, and a board left open would show "2 minutes ago" for as long as it is up. The
  // shared clock is the same one the agent cards' relative labels ride.
  const now = useNow(30_000)
  const title = entry.title.trim()
  // Why the built-in browser is the default and the system browser the modifier: the card exists
  // to reopen the conversation, and Orca's browser can continue it. The escape hatch matters
  // because that browser has its own cookie partition, so the first visit to a site may well land
  // logged out — and it stays one gesture away rather than being something the user must know.
  const systemBrowserLabel = `${translate(
    'sessionsBoard.web.card.openInSystemBrowser',
    'Open in system browser'
  )}. ${getPortSystemBrowserHint(isMac)}`

  return (
    <div className="group/card relative">
      {/* The body is the opener and the controls are siblings over it, because a button cannot
          contain a button — the same shape the agent card uses. */}
      <button
        type="button"
        data-testid="sessions-board-web-card"
        onClick={(event) => {
          if (opensInSystemBrowser(event, isMac)) {
            onOpenInSystemBrowser()
            return
          }
          onOpen()
        }}
        title={systemBrowserLabel}
        className={cn(
          'flex w-full flex-col gap-1.5 rounded-lg border border-border/60 bg-card p-2.5 text-left transition-colors',
          'hover:border-border hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none'
        )}
      >
        <span className="flex items-start gap-1.5 pr-18">
          <BrowserFavicon
            faviconUrl={entry.faviconUrl}
            className="size-3"
            fallbackClassName="size-3"
          />
          <span className="line-clamp-2 min-w-0 flex-1 text-xs font-medium leading-snug text-foreground">
            {title || entry.url}
          </span>
        </span>

        <span className="flex min-w-0 items-center gap-1.5 text-2xs text-muted-foreground">
          <span className="shrink-0 tabular-nums">
            {translate('sessionsBoard.web.card.visitCount', '{{count}} visits', {
              count: entry.visitCount
            })}
          </span>
          <span className="shrink-0 text-muted-foreground/55">·</span>
          <span className="shrink-0">{formatUiRelativeTime(entry.lastVisitedAt - now)}</span>
        </span>
      </button>

      <div className={ACTIONS_CLUSTER_CLASS}>
        {handOffMenu}
        <ActionButton
          testId="sessions-board-web-card-system-browser"
          label={systemBrowserLabel}
          disabled={false}
          onClick={onOpenInSystemBrowser}
        >
          <ExternalLink className="size-3.5" />
        </ActionButton>
        <ActionButton
          testId="sessions-board-web-card-copy-link"
          label={translate('sessionsBoard.web.card.copyLink', 'Copy link')}
          disabled={false}
          onClick={onCopyLink}
        >
          <Copy className="size-3.5" />
        </ActionButton>
      </div>
    </div>
  )
}
