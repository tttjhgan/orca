import { MessageSquarePlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { WEB_CONVERSATION_SITES } from '../../../../shared/web-conversation-sites'
import type { SessionsBoardWebActions } from './use-sessions-board-web-actions'

/**
 * Start a chat on a web AI site you have not used yet.
 *
 * Why the board needs this and the site columns are not enough: a column only exists once the site
 * has a conversation, which is exactly the case a new chat is for. This menu is the entry point
 * that does not depend on history.
 */
export function SessionsBoardNewConversationMenu({
  actions
}: {
  actions: SessionsBoardWebActions
}): React.JSX.Element {
  const label = translate('sessionsBoard.web.newConversation', 'New conversation')

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-label={label}
              data-testid="sessions-board-new-web-conversation"
            >
              <MessageSquarePlus className="size-3.5" />
              {label}
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={4}>
          {translate('sessionsBoard.web.newConversationHint', 'Open a fresh chat on a web AI site')}
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>
          {translate('sessionsBoard.web.newConversationSite', 'Start a chat on')}
        </DropdownMenuLabel>
        {/* Registry order, and every registered site — the one list that does not depend on
            whether the site has ever been visited in Orca's browser. */}
        {WEB_CONVERSATION_SITES.map((site) => (
          <DropdownMenuItem
            key={site.id}
            data-testid={`sessions-board-new-web-conversation-${site.id}`}
            onSelect={() => actions.openUrl(site.newConversationUrl)}
          >
            {site.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
