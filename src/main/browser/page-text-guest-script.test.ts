import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'
import { PAGE_TEXT_RAW_CHAR_BUDGET } from '../../shared/browser-page-text'
import { READ_PAGE_TEXT_SCRIPT } from './page-text-guest-script'

type GuestAnswer = { url: string; title: string; text: string } | null

/**
 * Why a real sandbox rather than an assertion on the script's text: what matters is what the guest
 * does with the page it lands on, and the fallbacks are the part a page can surprise.
 */
async function runAgainst(page: {
  containerText?: string | null
  bodyText?: string
  title?: string
  href?: string
  throwOnQuery?: boolean
}): Promise<GuestAnswer> {
  const context = {
    document: {
      title: page.title ?? '',
      querySelector: (): { innerText: string } | null => {
        if (page.throwOnQuery) {
          throw new Error('nope')
        }
        return page.containerText == null ? null : { innerText: page.containerText }
      },
      body: { innerText: page.bodyText ?? '' }
    },
    location: { href: page.href ?? 'https://chatgpt.com/c/abc?model=gpt-4' }
  }
  // Why no cast: the sandbox answers untyped, and the declared return above is the assertion.
  return await runInNewContext(READ_PAGE_TEXT_SCRIPT, context)
}

describe('READ_PAGE_TEXT_SCRIPT', () => {
  it('reads the container the conversation lives in, not the whole page', async () => {
    const conversation = `Assistant: roll the deployment back first. ${'and rerun it '.repeat(20)}`
    const answer = await runAgainst({
      containerText: conversation,
      bodyText: `navigation controls ${'x'.repeat(400)}`,
      title: 'Postgres migration plan'
    })

    expect(answer?.text).toBe(conversation)
    expect(answer?.title).toBe('Postgres migration plan')
    expect(answer?.url).toBe('https://chatgpt.com/c/abc?model=gpt-4')
  })

  it('falls back to the body when the container is a shell', async () => {
    // A site that mounts the conversation outside `main` — or renders it lazily — is still readable.
    const answer = await runAgainst({
      containerText: 'Loading…',
      bodyText: 'x'.repeat(300)
    })

    expect(answer?.text.length).toBe(300)
  })

  it('falls back to the body when the page has no container at all', async () => {
    const answer = await runAgainst({ containerText: null, bodyText: 'the whole page' })

    expect(answer?.text).toBe('the whole page')
  })

  it('bounds what it sends over the bridge', async () => {
    const answer = await runAgainst({ containerText: 'x'.repeat(PAGE_TEXT_RAW_CHAR_BUDGET * 2) })

    expect(answer?.text.length).toBe(PAGE_TEXT_RAW_CHAR_BUDGET)
  })

  it('answers nothing rather than throwing at the page', async () => {
    await expect(runAgainst({ throwOnQuery: true })).resolves.toBeNull()
  })
})
