import type { BrowserPageText } from '../../shared/browser-page-text'
import { readPageTextFromGuest } from './browser-page-text'
import { BrowserManagerGrab } from './browser-manager-grab'

export abstract class BrowserManagerPageText extends BrowserManagerGrab {
  /**
   * Read the text of the page a tool is acting on, for a hand-off that names it.
   *
   * Why the manager owns it: like the grab's own operations, it runs script in a guest, and the
   * guest it may run it in is the one `getAuthorizedGuest` resolved for the calling renderer.
   */
  async readPageText(
    _browserTabId: string,
    guest: Electron.WebContents
  ): Promise<BrowserPageText | null> {
    return readPageTextFromGuest(guest)
  }
}
