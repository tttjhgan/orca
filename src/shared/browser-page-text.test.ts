import { describe, expect, it } from 'vitest'
import { PAGE_TEXT_CHAR_BUDGET, PAGE_TEXT_ELISION_MARK, clampPageText } from './browser-page-text'

describe('clampPageText', () => {
  it('keeps a short page whole', () => {
    expect(clampPageText('a question and its answer')).toEqual({
      text: 'a question and its answer',
      truncated: false
    })
  })

  it('keeps the head and the tail of a long page, and marks the gap', () => {
    const page = `${'H'.repeat(PAGE_TEXT_CHAR_BUDGET)}${'T'.repeat(2000)}`

    const clamped = clampPageText(page)

    expect(clamped.truncated).toBe(true)
    expect(clamped.text).toContain(PAGE_TEXT_ELISION_MARK)
    expect(clamped.text.startsWith('H')).toBe(true)
    // Why the end matters most: a conversation's conclusion is the last thing on the page, so a
    // head-only cut would hand the agent the question and none of the answer.
    expect(clamped.text.endsWith('T')).toBe(true)
    expect(clamped.text.length).toBeLessThanOrEqual(
      PAGE_TEXT_CHAR_BUDGET + PAGE_TEXT_ELISION_MARK.length + 1
    )
  })

  it('trims the text it keeps', () => {
    expect(clampPageText('\n\n  hello  \n').text).toBe('hello')
  })
})
