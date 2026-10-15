import type { BrowserHistoryEntry } from '../../../../shared/browser-workspace-types'
import { translate } from '@/i18n/i18n'
import { webConversationSiteForUrl } from '../../../../shared/web-conversation-sites'

// Why a prompt and not a scraped transcript: nothing in the app reads a page's content for the
// agent, but the agent can read it itself with the browser skill it already has
// (`ORCA goto --url …` then `ORCA snapshot --json`, see skills/orca-cli/references/browser.md).
// Composing those two steps into one instruction is the whole feature; the URL sits in the text
// so the user can still edit the ask in the composer before sending.

/**
 * The instruction that hands a web conversation to an agent: where it is, what it is called, and
 * how to read it. The trailing ask is deliberately a placeholder — the user's own requirement is
 * the part only they can write.
 */
export function formatWebConversationAgentPrompt(entry: BrowserHistoryEntry): string {
  const site = webConversationSiteForUrl(entry.url)
  const siteName = site?.label ?? entry.url
  const title = entry.title.trim()
  return [
    translate(
      'sessionsBoard.web.prompt.intro',
      'Read this {{site}} conversation and work from it:',
      { site: siteName }
    ),
    '',
    translate('sessionsBoard.web.prompt.urlLabel', 'URL: {{url}}', { url: entry.url }),
    ...(title
      ? [translate('sessionsBoard.web.prompt.titleLabel', 'Title: {{title}}', { title })]
      : []),
    '',
    translate(
      'sessionsBoard.web.prompt.readInstruction',
      'Open and read the whole page with the orca-cli browser commands (ORCA goto --url "{{url}}", then ORCA snapshot --json).',
      { url: entry.url }
    ),
    translate(
      'sessionsBoard.web.prompt.summarizeInstruction',
      'Summarize its conclusion, then continue with what I ask next.'
    )
  ].join('\n')
}
