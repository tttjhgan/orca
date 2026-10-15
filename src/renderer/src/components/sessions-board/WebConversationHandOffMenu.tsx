import { useCallback, useEffect, useMemo, useState } from 'react'
import { Send } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ReviewNotesSendMenuContent } from '@/components/editor/ReviewNotesSendMenuContent'
import { preventAgentSendTargetOutsideDismiss } from '@/components/browser-pane/annotate/prevent-agent-send-target-outside-dismiss'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import type { BrowserHistoryEntry } from '../../../../shared/browser-workspace-types'
import { webConversationIdentity } from '../../../../shared/web-conversation-sites'
import { ActionButton } from './SessionsBoardSessionActions'
import { formatWebConversationAgentPrompt } from './web-conversation-agent-prompt'

/**
 * 「一键交给 Agent」 for a web conversation: the card's send control, and the picker it opens.
 *
 * Why it delegates rather than sends: `ReviewNotesSendMenuContent` is the picker the browser's
 * annotation tray and the diff-notes menu already open — it lists the worktree's running agents and
 * the new-agent quick launch, and delivers through the same send path as both. The only thing this
 * file adds is the prompt and a target-mode id of its own.
 */
export function WebConversationHandOffMenu({
  entry,
  worktreeId
}: {
  entry: BrowserHistoryEntry
  worktreeId: string | null
}): React.JSX.Element {
  const openAgentSendPopoverTargetMode = useAppStore((s) => s.openAgentSendPopoverTargetMode)
  const closeAgentSendPopoverTargetMode = useAppStore((s) => s.closeAgentSendPopoverTargetMode)
  const activeTargetModeId = useAppStore((s) => s.agentSendPopoverTargetMode?.id ?? null)
  // Why the worktree id as the fallback group: a worktree with no active group is its own single
  // group, and this is the fallback the browser-annotation send menu already uses.
  const groupId = useAppStore(
    (s) => (worktreeId ? s.activeGroupIdByWorktree[worktreeId] : undefined) ?? worktreeId ?? ''
  )
  const [menuOpen, setMenuOpen] = useState(false)
  const prompt = useMemo(() => formatWebConversationAgentPrompt(entry), [entry])
  // Keyed on the conversation's identity — the same key the list dedupes on — so one conversation is
  // always one send target, and two cards in the board never claim the same one.
  const targetModeId = `web-conversation:${webConversationIdentity(entry.url) || entry.normalizedUrl}`
  const handOffLabel = translate('sessionsBoard.web.card.handOff', 'Hand off to an agent')
  const noWorkspaceReason = translate(
    'sessionsBoard.web.handOffNoWorkspace',
    'No workspace selected to hand off to.'
  )

  const handleOpenChange = useCallback(
    (open: boolean): void => {
      if (!worktreeId) {
        if (open) {
          toast.error(noWorkspaceReason)
        }
        return
      }
      setMenuOpen(open)
      if (open) {
        openAgentSendPopoverTargetMode({
          id: targetModeId,
          worktreeId,
          source: 'web-conversation',
          prompt,
          label: translate('sessionsBoard.web.handOffLabel', 'Web conversation'),
          launchSource: 'web_conversation_send'
        })
      } else {
        closeAgentSendPopoverTargetMode(targetModeId)
      }
    },
    [
      closeAgentSendPopoverTargetMode,
      noWorkspaceReason,
      openAgentSendPopoverTargetMode,
      prompt,
      targetModeId,
      worktreeId
    ]
  )

  const effectiveMenuOpen = menuOpen && activeTargetModeId === targetModeId
  if (menuOpen && activeTargetModeId !== targetModeId) {
    // Why: one paint of a stale menu would show another target's picker; the local open bit only
    // means anything while this target is the active one.
    setMenuOpen(false)
  }

  useEffect(
    () => () => {
      closeAgentSendPopoverTargetMode(targetModeId)
    },
    [closeAgentSendPopoverTargetMode, targetModeId]
  )

  if (!worktreeId) {
    // Why a toast and not a disabled button: the refusal is about the machine's current state, not
    // about this conversation, and the reason is already on the control's label.
    return (
      <ActionButton
        testId="sessions-board-web-card-hand-off"
        label={noWorkspaceReason}
        disabled={false}
        onClick={() => toast.error(noWorkspaceReason)}
      >
        <Send className="size-3.5" />
      </ActionButton>
    )
  }

  return (
    <DropdownMenu modal={false} open={effectiveMenuOpen} onOpenChange={handleOpenChange}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={handOffLabel}
              data-testid="sessions-board-web-card-hand-off"
            >
              <Send className="size-3.5" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={4}>
          {handOffLabel}
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent
        align="end"
        className="min-w-[220px]"
        onInteractOutside={preventAgentSendTargetOutsideDismiss}
        onPointerDownOutside={preventAgentSendTargetOutsideDismiss}
      >
        <ReviewNotesSendMenuContent
          worktreeId={worktreeId}
          groupId={groupId}
          prompt={prompt}
          // Why submit rather than draft: the prompt already carries the instruction — read the
          // page, summarize it — so the agent starts reading the moment it is handed the work, and
          // the user's own ask goes in as the next message.
          promptDelivery="submit-after-ready"
          launchSource="web_conversation_send"
        />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
