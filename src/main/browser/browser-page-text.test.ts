import { describe, expect, it, vi } from 'vitest'
import { PAGE_TEXT_CHAR_BUDGET, PAGE_TEXT_ELISION_MARK } from '../../shared/browser-page-text'
import {
  clampPageTextPayload,
  readPageTextFromGuest,
  type GuestPageReader
} from './browser-page-text'

function guestResolving(value: unknown): GuestPageReader {
  return { executeJavaScript: vi.fn().mockResolvedValue(value) }
}

describe('clampPageTextPayload', () => {
  it('keeps the page’s title, text and bounded length', () => {
    expect(
      clampPageTextPayload({
        url: 'https://chatgpt.com/c/abc',
        title: '  Postgres migration  ',
        text: 'the page text'
      })
    ).toEqual({
      url: 'https://chatgpt.com/c/abc',
      title: 'Postgres migration',
      text: 'the page text',
      truncated: false
    })
  })

  it('strips the query and the fragment from the page’s own URL', () => {
    // Why: a conversation site can carry a token in the query, and this URL is only ever used to
    // check the tab is still on the conversation — nothing downstream needs the rest of it.
    const clamped = clampPageTextPayload({
      url: 'https://chatgpt.com/c/abc?access_token=secret#reply',
      title: 't',
      text: 'x'
    })

    expect(clamped?.url).toBe('https://chatgpt.com/c/abc')
  })

  it('refuses a URL in a scheme a page could arm', () => {
    expect(clampPageTextPayload({ url: 'javascript:alert(1)', title: 't', text: 'x' })?.url).toBe(
      ''
    )
  })

  it('bounds the text the way the shared clamp does', () => {
    const clamped = clampPageTextPayload({
      url: 'https://chatgpt.com/c/abc',
      title: 't',
      text: 'H'.repeat(PAGE_TEXT_CHAR_BUDGET * 2)
    })

    expect(clamped?.truncated).toBe(true)
    expect(clamped?.text).toContain(PAGE_TEXT_ELISION_MARK)
  })

  it('refuses a payload that is not a page’s text', () => {
    expect(clampPageTextPayload(null)).toBeNull()
    expect(clampPageTextPayload('text')).toBeNull()
    expect(clampPageTextPayload({ url: 'https://a.test', text: 42 })).toBeNull()
    // A page with nothing readable on it is not an attachment.
    expect(clampPageTextPayload({ url: 'https://a.test', title: 't', text: '   ' })).toBeNull()
  })

  it('keeps a page that reported no URL, leaving the check to the renderer', () => {
    expect(clampPageTextPayload({ title: 't', text: 'x' })?.url).toBe('')
  })
})

describe('readPageTextFromGuest', () => {
  it('reads the guest once and clamps what it answers', async () => {
    const guest = guestResolving({
      url: 'https://chat.deepseek.com/a/chat/s/abc',
      title: 'Postgres migration plan',
      text: 'the conversation'
    })

    const page = await readPageTextFromGuest(guest)

    expect(guest.executeJavaScript).toHaveBeenCalledTimes(1)
    expect(page?.text).toBe('the conversation')
  })

  it('answers nothing when the guest refuses the injection', async () => {
    const guest: GuestPageReader = {
      executeJavaScript: vi.fn().mockRejectedValue(new Error('blocked'))
    }

    await expect(readPageTextFromGuest(guest)).resolves.toBeNull()
  })

  it('answers nothing when the guest reports no payload', async () => {
    await expect(readPageTextFromGuest(guestResolving(undefined))).resolves.toBeNull()
  })
})
