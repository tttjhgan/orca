import { clampPageText, type BrowserPageText } from '../../shared/browser-page-text'
import { READ_PAGE_TEXT_SCRIPT } from './page-text-guest-script'

const SAFE_PAGE_URL_PROTOCOLS = new Set(['http:', 'https:', 'file:'])

/**
 * Why the page's URL is re-derived here rather than taken as the guest wrote it: a compromise or a
 * bug in the guest must not be able to put a token-bearing query string — or a `javascript:` URL —
 * into the prompt an agent reads. Same stance as `clampGrabPayload`.
 */
function sanitizePageUrl(raw: unknown): string {
  const value = typeof raw === 'string' ? raw : ''
  if (!value) {
    return ''
  }
  try {
    const url = new URL(value)
    if (!SAFE_PAGE_URL_PROTOCOLS.has(url.protocol)) {
      return ''
    }
    url.search = ''
    url.hash = ''
    return url.toString()
  } catch {
    return ''
  }
}

/** Re-validate what the guest reported, the main-side half of the same contract. */
export function clampPageTextPayload(raw: unknown): BrowserPageText | null {
  if (!raw || typeof raw !== 'object') {
    return null
  }
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: this is the guest's answer crossing a WebContents boundary, so it is unknown until every field below is checked.
  const obj = raw as Record<string, unknown>
  if (typeof obj.text !== 'string') {
    return null
  }
  const clamped = clampPageText(obj.text)
  if (!clamped.text) {
    return null
  }
  return {
    url: sanitizePageUrl(obj.url),
    title: typeof obj.title === 'string' ? obj.title.slice(0, 500).trim() : '',
    text: clamped.text,
    truncated: clamped.truncated
  }
}

/**
 * Why the read names a shape rather than a WebContents: the injection is the only member it uses, and
 * a real guest satisfies this on its own — no cast, here or in the tests that stand one up.
 */
export type GuestPageReader = { executeJavaScript: (code: string) => Promise<unknown> }

/**
 * Read the guest's own text, once, in front of the reader who asked for it.
 *
 * Why the guest and not a fetch from main: a fetch would be a different session — fresh cookies,
 * no login — and would read a page the reader is not looking at.
 */
export async function readPageTextFromGuest(
  guest: GuestPageReader
): Promise<BrowserPageText | null> {
  try {
    const raw: unknown = await guest.executeJavaScript(READ_PAGE_TEXT_SCRIPT)
    return clampPageTextPayload(raw)
  } catch {
    // Why silent: a guest that refuses the injection, navigated away mid-read or is already gone
    // answers the same way to the reader — the text could not be read — and the caller says so.
    return null
  }
}
