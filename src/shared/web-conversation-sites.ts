// Why this file is a registry of hosts and paths rather than a set of per-site
// conversation-URL patterns: a site that renames one route would silently stop
// matching a pattern, and every conversation on it would vanish from the board
// with nothing to show why. Deciding by "a registered host, on a path that is not
// the site's own furniture" degrades the other way — the worst case is one extra
// page appearing as a card, which its title still makes identifiable. It also
// means this module needs no knowledge of any site's current URL shapes.

export type WebConversationSiteId = 'chatgpt' | 'deepseek' | 'doubao' | 'kimi'

export type WebConversationSite = {
  id: WebConversationSiteId
  /** A product name, not a translatable string. */
  label: string
  /** Every host the site answers on, including legacy domains; `www.` is implied. */
  hosts: readonly string[]
  /** A URL on this site that starts a fresh conversation. */
  newConversationUrl: string
  /** Routes that are never a conversation, so a visit to one records nothing. */
  nonConversationPathPrefixes?: readonly string[]
  /**
   * An allowlist for a site whose pages are too varied for the denylist to sort out;
   * when present it wins. No registered site needs one today — it is here so the fix
   * for a noisy site is one line, not a redesign.
   */
  conversationPathPrefixes?: readonly string[]
}

/** Site furniture: auth, marketing and settings pages, on every site. */
const COMMON_NON_CONVERSATION_PREFIXES = [
  '/auth',
  // The OAuth callback some sites land on after logging in (DeepSeek's `/authorized?provider=…`);
  // a browsing pass recorded one as a card under the site's own landing title.
  '/authorized',
  '/login',
  '/logout',
  // DeepSeek's login route; listed here rather than per-site because any site may use it.
  '/sign_in',
  '/signin',
  '/signup',
  '/register',
  '/settings',
  '/account',
  '/pricing',
  '/plans',
  '/about',
  '/terms',
  '/privacy',
  '/legal',
  '/help',
  '/faq',
  '/blog',
  '/docs',
  '/download'
] as const

export const WEB_CONVERSATION_SITES: readonly WebConversationSite[] = [
  {
    id: 'chatgpt',
    label: 'ChatGPT',
    hosts: ['chatgpt.com', 'chat.openai.com'],
    newConversationUrl: 'https://chatgpt.com/',
    nonConversationPathPrefixes: ['/explore', '/gpts', '/apps']
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    hosts: ['chat.deepseek.com'],
    newConversationUrl: 'https://chat.deepseek.com/'
  },
  {
    id: 'doubao',
    label: 'Doubao',
    hosts: ['doubao.com'],
    // Why the chat page rather than the home: Doubao's home is a product landing page, and `/chat`
    // is where a conversation is actually started.
    newConversationUrl: 'https://www.doubao.com/chat/',
    nonConversationPathPrefixes: ['/discover']
  },
  {
    id: 'kimi',
    label: 'Kimi',
    hosts: ['kimi.com', 'kimi.moonshot.cn'],
    newConversationUrl: 'https://www.kimi.com/',
    // Why these four: a real browsing pass recorded each of them as a card while it held no
    // conversation — `/project/create` and `/project/<id>` (the project shell, which carries the
    // marketing page's title), `/agent` (the agent tool launcher) and `/membership/pricing`.
    // Kimi's conversations live under `/chat/`, which stays allowed.
    nonConversationPathPrefixes: ['/discover', '/agent', '/membership', '/project']
  }
]

/**
 * Where each site's own "new conversation" page lives, as a comparable path. Precomputed because
 * the check runs on every recorded visit, and collapsed to one string per site so `isWebConversationUrl`
 * compares paths rather than re-parsing a URL.
 */
const newConversationPathBySiteId: ReadonlyMap<WebConversationSiteId, string> = new Map(
  WEB_CONVERSATION_SITES.map((site) => [
    site.id,
    (parseWebUrl(site.newConversationUrl)?.pathname ?? '').replace(/\/+$/, '')
  ])
)

/** Exported for tests and for callers that need the registry order as identity. */
export function webConversationSiteIds(): readonly WebConversationSiteId[] {
  return WEB_CONVERSATION_SITES.map((site) => site.id)
}

function parseWebUrl(url: string): URL | null {
  try {
    const parsed = new URL(url)
    // Why: file:, data: and chrome-extension: URLs are never a web conversation, and
    // `new URL` accepts far more schemes than these pages can be served over.
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed : null
  } catch {
    return null
  }
}

function normalizeHost(hostname: string): string {
  return hostname.toLowerCase().replace(/\.+$/, '')
}

function hostBelongsToSite(site: WebConversationSite, hostname: string): boolean {
  const host = normalizeHost(hostname)
  return site.hosts.some((candidate) => {
    const apex = normalizeHost(candidate)
    return host === apex || host === `www.${apex}`
  })
}

/** Path equality on segment boundaries, so `/settings` never swallows `/settingsfoo`. */
function pathMatchesPrefix(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(prefix.endsWith('/') ? prefix : `${prefix}/`)
}

/** The site a URL's host belongs to, whatever path it is on. */
export function webConversationSiteForUrl(url: string): WebConversationSite | null {
  const parsed = parseWebUrl(url)
  if (!parsed) {
    return null
  }
  return WEB_CONVERSATION_SITES.find((site) => hostBelongsToSite(site, parsed.hostname)) ?? null
}

/**
 * What makes two URLs the same conversation: scheme, host and path, with the query and the fragment
 * dropped.
 *
 * Why not the whole URL: a chat site tags the *link you arrived by*, not the conversation. Kimi
 * appends `?chat_enter_method=home`, other sites append a referral or a model hint, so the same
 * conversation entered from the home page and from the sidebar is two different URLs. Held as two,
 * it becomes two cards in one column, each with its own visit count and its own hand-off target —
 * the board counting one conversation twice. The conversation lives in the path on every registered
 * site; the query is the site's own state about how you got there. Dropping the query and the
 * fragment also means a token a site keeps in either one cannot ride along into an identity.
 *
 * Empty for a URL that cannot be parsed, which matches nothing — including another unparseable URL.
 */
export function webConversationIdentity(url: string): string {
  const parsed = parseWebUrl(url)
  if (!parsed) {
    return ''
  }
  parsed.search = ''
  parsed.hash = ''
  // Why the trailing slash is stripped: `/c/abc` and `/c/abc/` are one page, and a site that
  // rewrites one into the other would otherwise make two rows of it.
  return parsed.toString().replace(/\/+$/, '')
}

/**
 * Whether a URL is a conversation worth remembering — a registered host, on a path that
 * is neither the site's home (which *is* its new-conversation page) nor one of its
 * furniture routes.
 */
export function isWebConversationUrl(url: string): boolean {
  const parsed = parseWebUrl(url)
  if (!parsed) {
    return false
  }
  const site = WEB_CONVERSATION_SITES.find((candidate) =>
    hostBelongsToSite(candidate, parsed.hostname)
  )
  if (!site) {
    return false
  }
  // Why trailing slashes are stripped: "/" and "" both mean the site's home.
  const path = parsed.pathname.replace(/\/+$/, '')
  // Why the site's own launcher is denied here and not in the table: starting a conversation is
  // never holding one, the same way the home page — usually the same page — is not. Reading it
  // back out of `newConversationUrl` covers the site whose launcher is *not* its home (Doubao's
  // `/chat`) without a second entry to keep in step with the first.
  if (path === '' || path === newConversationPathBySiteId.get(site.id)) {
    return false
  }
  if (site.conversationPathPrefixes?.length) {
    return site.conversationPathPrefixes.some((prefix) => pathMatchesPrefix(path, prefix))
  }
  const denied = [...COMMON_NON_CONVERSATION_PREFIXES, ...(site.nonConversationPathPrefixes ?? [])]
  return !denied.some((prefix) => pathMatchesPrefix(path, prefix))
}

/** The label to show for a site id, for surfaces that hold only the id. */
export function webConversationSiteLabel(id: WebConversationSiteId): string {
  return WEB_CONVERSATION_SITES.find((site) => site.id === id)?.label ?? id
}
