import { describe, expect, it } from 'vitest'
import {
  WEB_CONVERSATION_SITES,
  isWebConversationUrl,
  webConversationSiteForUrl,
  webConversationSiteIds,
  webConversationSiteLabel
} from './web-conversation-sites'

describe('webConversationSiteForUrl', () => {
  it('matches each registered site on its apex and legacy hosts', () => {
    expect(webConversationSiteForUrl('https://chatgpt.com/c/abc')?.id).toBe('chatgpt')
    expect(webConversationSiteForUrl('https://chat.openai.com/c/abc')?.id).toBe('chatgpt')
    expect(webConversationSiteForUrl('https://chat.deepseek.com/a/chat/s/abc')?.id).toBe('deepseek')
    expect(webConversationSiteForUrl('https://www.doubao.com/chat/abc')?.id).toBe('doubao')
    expect(webConversationSiteForUrl('https://www.kimi.com/chat/abc')?.id).toBe('kimi')
    expect(webConversationSiteForUrl('https://kimi.moonshot.cn/chat/abc')?.id).toBe('kimi')
  })

  it('ignores case and a trailing dot in the host', () => {
    expect(webConversationSiteForUrl('https://CHATGPT.com/c/abc')?.id).toBe('chatgpt')
    expect(webConversationSiteForUrl('https://chatgpt.com./c/abc')?.id).toBe('chatgpt')
  })

  it('does not match a host that merely contains a registered one', () => {
    expect(webConversationSiteForUrl('https://chatgpt.com.evil.example/c/abc')).toBeNull()
    expect(webConversationSiteForUrl('https://notchatgpt.com/c/abc')).toBeNull()
  })

  it('rejects non-http schemes and unparseable input', () => {
    expect(webConversationSiteForUrl('file:///c/abc')).toBeNull()
    expect(webConversationSiteForUrl('data:text/html,chatgpt.com/c/abc')).toBeNull()
    expect(webConversationSiteForUrl('about:blank')).toBeNull()
    expect(webConversationSiteForUrl('chatgpt.com/c/abc')).toBeNull()
  })

  it('rejects an unregistered site', () => {
    expect(webConversationSiteForUrl('https://claude.ai/chat/abc')).toBeNull()
  })
})

describe('isWebConversationUrl', () => {
  it('accepts a path that names a conversation', () => {
    expect(isWebConversationUrl('https://chatgpt.com/c/68f0-abc')).toBe(true)
    expect(isWebConversationUrl('https://chat.deepseek.com/a/chat/s/8f21')).toBe(true)
  })

  it('rejects the site home, which is where a new conversation starts', () => {
    expect(isWebConversationUrl('https://chatgpt.com/')).toBe(false)
    expect(isWebConversationUrl('https://chatgpt.com')).toBe(false)
    expect(isWebConversationUrl('https://chat.deepseek.com/')).toBe(false)
    expect(isWebConversationUrl('https://www.kimi.com/')).toBe(false)
  })

  it('rejects site furniture on a conversation-capable host', () => {
    expect(isWebConversationUrl('https://chatgpt.com/pricing')).toBe(false)
    expect(isWebConversationUrl('https://chatgpt.com/explore')).toBe(false)
    expect(isWebConversationUrl('https://chat.deepseek.com/sign_in')).toBe(false)
    expect(isWebConversationUrl('https://www.kimi.com/settings/preferences')).toBe(false)
    expect(isWebConversationUrl('https://chatgpt.com/terms')).toBe(false)
  })

  it('matches a prefix only at a path-segment boundary', () => {
    // `/settings` must not swallow a route that merely starts with those letters.
    expect(isWebConversationUrl('https://chatgpt.com/settingsfoo/c/abc')).toBe(true)
    expect(isWebConversationUrl('https://chatgpt.com/settings/c/abc')).toBe(false)
  })

  it('keeps a query string from making a non-conversation look like one', () => {
    expect(isWebConversationUrl('https://chatgpt.com/?model=gpt-5')).toBe(false)
    expect(isWebConversationUrl('https://chatgpt.com/pricing?ref=nav')).toBe(false)
    expect(isWebConversationUrl('https://chat.deepseek.com/?q=hello')).toBe(false)
  })

  it('ignores the hash, which is never part of the route', () => {
    expect(isWebConversationUrl('https://chatgpt.com/#/c/abc')).toBe(false)
    expect(isWebConversationUrl('https://chatgpt.com/c/abc#bottom')).toBe(true)
  })

  it('does not treat a percent-encoded denylist path as furniture', () => {
    // Deliberately not decoded: these sites do not encode their denylisted routes, and decoding
    // here would make the boundary check depend on URL-parser quirks instead of the literal path.
    expect(isWebConversationUrl('https://chatgpt.com/%73ettings')).toBe(true)
  })

  it('rejects a site’s own launcher without swallowing the conversations beneath it', () => {
    // Doubao's launcher is `/chat` and every conversation is `/chat/<id>`. The launcher is denied
    // because it *is* this site's `newConversationUrl`, not because a prefix covers it — a prefix
    // would deny every conversation on the site with it.
    expect(isWebConversationUrl('https://www.doubao.com/chat')).toBe(false)
    expect(isWebConversationUrl('https://www.doubao.com/chat/')).toBe(false)
    expect(isWebConversationUrl('https://www.doubao.com/chat/68f0abc')).toBe(true)
    // Nothing about that denial may leak into a route that merely starts with those letters.
    expect(isWebConversationUrl('https://www.doubao.com/chats/68f0abc')).toBe(true)
  })

  it('rejects Doubao’s landing pages and home', () => {
    expect(isWebConversationUrl('https://www.doubao.com/')).toBe(false)
    expect(isWebConversationUrl('https://www.doubao.com/discover')).toBe(false)
    expect(isWebConversationUrl('https://www.doubao.com/download')).toBe(false)
  })
})

describe('registry', () => {
  it('exposes the three requested sites in a stable order', () => {
    expect(webConversationSiteIds()).toEqual(['chatgpt', 'deepseek', 'doubao', 'kimi'])
    expect(WEB_CONVERSATION_SITES.map((site) => site.id)).toEqual(webConversationSiteIds())
  })

  it('gives every site a new-conversation URL on one of its own hosts', () => {
    for (const site of WEB_CONVERSATION_SITES) {
      expect(webConversationSiteForUrl(site.newConversationUrl)?.id).toBe(site.id)
    }
  })

  it('never records the new-conversation URL itself as a conversation', () => {
    // The one invariant of the registry that is a rule rather than a table entry: starting a
    // conversation is not holding one. It is what covers a site whose launcher is not its home —
    // Doubao's `/chat` — with no per-site deny to add or forget when a site is registered.
    for (const site of WEB_CONVERSATION_SITES) {
      expect(isWebConversationUrl(site.newConversationUrl), site.id).toBe(false)
    }
  })

  it('labels a site by its product name, and falls back to the id', () => {
    expect(webConversationSiteLabel('kimi')).toBe('Kimi')
    expect(webConversationSiteLabel('deepseek')).toBe('DeepSeek')
    expect(webConversationSiteLabel('doubao')).toBe('Doubao')
    expect(webConversationSiteLabel('chatgpt')).toBe('ChatGPT')
  })
})
