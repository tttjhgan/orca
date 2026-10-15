import { ipcMain } from 'electron'
import { browserManager } from '../browser/browser-manager'
import { isTrustedBrowserRenderer } from './browser-renderer-trust'
import type {
  BrowserReadPageTextArgs,
  BrowserReadPageTextResult
} from '../../shared/browser-page-text'

/**
 * Reading the page the reader is looking at, for a hand-off that names it.
 *
 * Why an invoke channel and not a command: the text is read once, the moment the reader asks, and
 * the answer is theirs to see before anything is sent — no agent, no background read.
 */
export function registerBrowserPageTextHandlers(): void {
  ipcMain.removeHandler('browser:readPageText')

  ipcMain.handle(
    'browser:readPageText',
    async (event, args: BrowserReadPageTextArgs): Promise<BrowserReadPageTextResult> => {
      if (!isTrustedBrowserRenderer(event.sender)) {
        return { ok: false, reason: 'not-authorized' }
      }
      // The only door a tool may reach a guest through, and the one that knows about the document
      // half of the registry.
      const guest = browserManager.getAuthorizedGuest(args.browserPageId, event.sender.id)
      if (!guest) {
        return { ok: false, reason: 'not-ready' }
      }
      const page = await browserManager.readPageText(args.browserPageId, guest)
      return page ? { ok: true, page } : { ok: false, reason: 'unavailable' }
    }
  )
}
