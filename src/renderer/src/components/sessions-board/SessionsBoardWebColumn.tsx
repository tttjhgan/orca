import { Plus } from 'lucide-react'
import { BrowserFavicon } from '@/components/browser-favicon'
import { translate } from '@/i18n/i18n'
import { webConversationIdentity } from '../../../../shared/web-conversation-sites'
import { ActionButton } from './SessionsBoardSessionActions'
import { SessionsBoardColumnShell } from './SessionsBoardColumnShell'
import { WebConversationCard } from './WebConversationCard'
import { WebConversationHandOffMenu } from './WebConversationHandOffMenu'
import type { SessionsBoardWebColumn as SessionsBoardWebColumnData } from './sessions-board-web-columns'
import type { SessionsBoardWebActions } from './use-sessions-board-web-actions'

/**
 * One web AI site's conversations, as a column beside the agent columns.
 *
 * The chrome is the agent column's (`SessionsBoardColumnShell`); what differs is everything inside
 * it — a site icon instead of an agent icon, a "new conversation" control in the header, and
 * conversation cards instead of session cards.
 */
export function SessionsBoardWebColumn({
  column,
  collapsed,
  onToggleCollapsed,
  actions
}: {
  column: SessionsBoardWebColumnData
  collapsed: boolean
  onToggleCollapsed: () => void
  actions: SessionsBoardWebActions
}): React.JSX.Element {
  const newConversationLabel = translate('sessionsBoard.web.newConversation', 'New conversation')
  // The site's own favicon, taken from the most recent conversation: same host, so the same icon
  // the browser tab shows. `BrowserFavicon` already falls back to a globe when there is none.
  const siteFavicon = column.conversations[0]?.faviconUrl
  const icon = <BrowserFavicon faviconUrl={siteFavicon} className="size-3.5" />

  return (
    <SessionsBoardColumnShell
      columnKey={column.siteId}
      // Why the site column states a prefix: the site ids and the agent ids share a namespace
      // ('kimi' is both the Kimi site and the Kimi CLI agent), so the shell cannot derive a test
      // id from the key alone without the two kinds of column matching each other.
      testIdPrefix="sessions-board-web-column"
      label={column.label}
      count={column.conversations.length}
      icon={icon}
      // Sized to match the agent rail's icons, which are drawn larger than the header's.
      railIcon={<BrowserFavicon faviconUrl={siteFavicon} className="size-4" />}
      collapsed={collapsed}
      onToggleCollapsed={onToggleCollapsed}
      headerAction={
        <ActionButton
          testId={`sessions-board-web-column-new-${column.siteId}`}
          label={newConversationLabel}
          disabled={false}
          onClick={() => actions.openUrl(column.newConversationUrl)}
        >
          <Plus className="size-3.5" />
        </ActionButton>
      }
    >
      {column.conversations.map((entry) => (
        <WebConversationCard
          // Why the conversation's identity rather than the recorded URL: a re-visit by a different
          // entry link updates the same row, and keying on the link would remount the card for it.
          key={webConversationIdentity(entry.url) || entry.normalizedUrl}
          entry={entry}
          onOpen={() => actions.openUrl(entry.url)}
          onOpenInSystemBrowser={() => actions.openUrlInSystemBrowser(entry.url)}
          onCopyLink={() => actions.copyUrl(entry.url)}
          handOffMenu={<WebConversationHandOffMenu entry={entry} worktreeId={actions.worktreeId} />}
        />
      ))}
    </SessionsBoardColumnShell>
  )
}
