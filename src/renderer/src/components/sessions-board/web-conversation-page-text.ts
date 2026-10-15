import { useCallback, useState } from 'react'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import type { BrowserHistoryEntry, BrowserPage } from '../../../../shared/browser-workspace-types'
import type {
  BrowserPageText,
  BrowserReadPageTextRejectReason
} from '../../../../shared/browser-page-text'
import { webConversationIdentity } from '../../../../shared/web-conversation-sites'

/**
 * The tab that is showing a conversation right now, or null when none is.
 *
 * Why the live pages and not the conversation's own history entry: the entry says where the
 * conversation is, not what this machine is looking at, and only the tab can be read.
 */
export function findPageShowingConversation(
  pagesByWorkspace: Record<string, BrowserPage[]>,
  entry: BrowserHistoryEntry
): BrowserPage | null {
  // Why the conversation's identity and not its URL: the entry's URL is the link it was recorded
  // from, and the tab it is open in may have arrived by a different one.
  const key = webConversationIdentity(entry.url)
  if (!key) {
    return null
  }
  for (const pages of Object.values(pagesByWorkspace)) {
    for (const page of pages) {
      // Why a document page is skipped rather than a candidate: it shows a file from a workspace,
      // and its URL is blank by contract, so it could only ever match by accident.
      if (page.docLocation || !page.url) {
        continue
      }
      if (webConversationIdentity(page.url) === key) {
        return page
      }
    }
  }
  return null
}

/** `page-moved-on` is the tab having navigated between the click and the read. */
export type WebConversationPageTextFailure = BrowserReadPageTextRejectReason | 'page-moved-on'

export type WebConversationPageTextOutcome =
  | { status: 'idle' }
  | { status: 'reading' }
  | { status: 'attached'; text: BrowserPageText }
  | { status: 'failed'; reason: WebConversationPageTextFailure }

/** The sentence a failed attachment shows: one for what the reader can act on, one for the rest. */
export function webConversationPageTextFailureMessage(
  reason: WebConversationPageTextFailure
): string {
  if (reason === 'page-moved-on') {
    return translate(
      'sessionsBoard.web.attach.failedMovedOn',
      'The tab moved on before its text could be read.'
    )
  }
  return translate('sessionsBoard.web.attach.failed', 'The page could not be read.')
}

export type WebConversationPageText = {
  /** The tab showing this conversation, which is what makes an attachment possible at all. */
  page: BrowserPage | null
  outcome: WebConversationPageTextOutcome
  attach: () => void
  detach: () => void
}

/**
 * Reads a conversation's page text on request — once, at the click, and never in the background.
 *
 * Why the reason is kept as a code: the sentence the reader sees is the renderer's to translate, and
 * the same codes arrive from main.
 */
export function useWebConversationPageText(entry: BrowserHistoryEntry): WebConversationPageText {
  const pagesByWorkspace = useAppStore((state) => state.browserPagesByWorkspace)
  const page = findPageShowingConversation(pagesByWorkspace, entry)
  const [outcome, setOutcome] = useState<WebConversationPageTextOutcome>({ status: 'idle' })

  const attach = useCallback((): void => {
    if (!page) {
      return
    }
    setOutcome({ status: 'reading' })
    void window.api.browser.readPageText({ browserPageId: page.id }).then((result) => {
      if (!result.ok) {
        setOutcome({ status: 'failed', reason: result.reason })
        return
      }
      // Why the URL is checked again: the read is asynchronous, and a tab that navigated while it
      // ran would otherwise attach one page's text to another page's prompt.
      if (webConversationIdentity(result.page.url) !== webConversationIdentity(entry.url)) {
        setOutcome({ status: 'failed', reason: 'page-moved-on' })
        return
      }
      setOutcome({ status: 'attached', text: result.page })
    })
  }, [entry.url, page])

  const detach = useCallback((): void => {
    setOutcome({ status: 'idle' })
  }, [])

  return { page, outcome, attach, detach }
}
