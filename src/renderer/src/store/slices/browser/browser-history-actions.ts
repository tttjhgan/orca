import type { BrowserHistoryEntry } from '../../../../../shared/browser-workspace-types'
import type { BrowserSlice, BrowserSliceGet, BrowserSliceSet } from './browser-slice-contract'
import type { WorkspaceDocHistoryEntry } from '../../../../../shared/workspace-doc-history'
import { redactKagiSessionToken } from '../../../../../shared/browser-url'
import {
  MAX_BROWSER_HISTORY_ENTRIES,
  normalizeBrowserHistoryUrl
} from '../../../../../shared/workspace-session-browser-history'
import { recordWebConversationVisit } from '../../../../../shared/workspace-session-web-conversations'
import {
  MAX_WORKSPACE_DOC_HISTORY_ENTRIES,
  normalizeWorkspaceDocHistoryEntries,
  normalizeWorkspaceDocHistoryTitle,
  workspaceDocHistoryEntriesEqual
} from '../../../../../shared/workspace-doc-history'
import { browserPageDocLocationsEqual } from '../../../../../shared/browser-page-doc-location'
import { ORCA_BROWSER_BLANK_URL } from '../../../../../shared/constants'

export function createBrowserHistoryActions(
  set: BrowserSliceSet,
  get: BrowserSliceGet
): Pick<
  BrowserSlice,
  | 'recordWorkspaceDocVisit'
  | 'addBrowserHistoryEntry'
  | 'removeBrowserHistoryEntry'
  | 'restoreBrowserHistoryEntry'
  | 'clearBrowserHistory'
> {
  return {
    recordWorkspaceDocVisit: (docLocation, title, options) => {
      const bump = options?.bump ?? true
      set((s) => {
        const now = Date.now()
        const existing = s.workspaceDocHistory.find((entry) =>
          browserPageDocLocationsEqual(entry.docLocation, docLocation)
        )
        if (!existing && !bump) {
          // A title refresh for a document never visited records nothing.
          return s
        }
        const normalizedTitle = normalizeWorkspaceDocHistoryTitle(
          title ?? existing?.title,
          docLocation
        )
        const updated: WorkspaceDocHistoryEntry | null = existing
          ? {
              ...existing,
              title: normalizedTitle,
              ...(bump ? { lastVisitedAt: now, visitCount: existing.visitCount + 1 } : {})
            }
          : null
        // A repeated title-updated event from a live preview changes nothing; hand back the same
        // state so no subscriber re-renders. Over the cap the old path still had trimming to do.
        if (
          existing &&
          updated &&
          workspaceDocHistoryEntriesEqual(updated, existing) &&
          s.workspaceDocHistory.length <= MAX_WORKSPACE_DOC_HISTORY_ENTRIES
        ) {
          return s
        }
        const next: WorkspaceDocHistoryEntry[] = updated
          ? s.workspaceDocHistory.map((entry) => (entry === existing ? updated : entry))
          : [
              { docLocation, title: normalizedTitle, lastVisitedAt: now, visitCount: 1 },
              ...s.workspaceDocHistory
            ]
        return {
          workspaceDocHistory:
            next.length > MAX_WORKSPACE_DOC_HISTORY_ENTRIES
              ? normalizeWorkspaceDocHistoryEntries(next)
              : next
        }
      })
    },

    addBrowserHistoryEntry: (url, title, faviconUrl) => {
      const safeUrl = redactKagiSessionToken(url)
      if (safeUrl === ORCA_BROWSER_BLANK_URL || safeUrl === 'about:blank' || !safeUrl) {
        return
      }
      const normalized = normalizeBrowserHistoryUrl(safeUrl)
      set((s) => {
        const visitedAt = Date.now()
        const existing = s.browserUrlHistory.find((entry) => entry.normalizedUrl === normalized)
        let next: BrowserHistoryEntry[] = existing
          ? s.browserUrlHistory.map((entry) =>
              entry === existing
                ? {
                    ...entry,
                    title,
                    ...(faviconUrl !== undefined ? { faviconUrl } : {}),
                    lastVisitedAt: visitedAt,
                    visitCount: entry.visitCount + 1
                  }
                : entry
            )
          : [
              {
                url: safeUrl,
                normalizedUrl: normalized,
                title,
                ...(faviconUrl !== undefined ? { faviconUrl } : {}),
                lastVisitedAt: visitedAt,
                visitCount: 1
              },
              ...s.browserUrlHistory
            ]
        if (next.length > MAX_BROWSER_HISTORY_ENTRIES) {
          next = next
            .sort((a, b) => b.lastVisitedAt - a.lastVisitedAt)
            .slice(0, MAX_BROWSER_HISTORY_ENTRIES)
        }
        return {
          browserUrlHistory: next,
          // Why written here rather than from the webview: navigation, in-page route changes and
          // title updates all funnel through this one function, so folding the conversation list
          // into the same `set()` is what keeps the two lists from drifting — a second call site
          // would be one more place to forget. The helper returns `entries` untouched for a URL
          // that is not a conversation on a registered site. A favicon that arrives later is the
          // one thing that does not pass through here; it is repaired in `updateBrowserPageState`
          // alongside the browsing list, so the two still move together.
          webConversationHistory: recordWebConversationVisit(s.webConversationHistory, {
            url: safeUrl,
            normalizedUrl: normalized,
            title,
            faviconUrl,
            visitedAt
          })
        }
      })
    },

    removeBrowserHistoryEntry: (normalizedUrl) => {
      const removed =
        get().browserUrlHistory.find((entry) => entry.normalizedUrl === normalizedUrl) ?? null
      if (removed) {
        set((s) => ({
          browserUrlHistory: s.browserUrlHistory.filter((entry) => entry !== removed)
        }))
      }
      return removed
    },

    restoreBrowserHistoryEntry: (entry) => {
      set((s) =>
        // A revisit between remove and Undo already re-created the row; keep the live one.
        s.browserUrlHistory.some((existing) => existing.normalizedUrl === entry.normalizedUrl)
          ? s
          : { browserUrlHistory: [entry, ...s.browserUrlHistory] }
      )
    },

    // One clear for both sources: the dropdown presents them as one history. The conversation
    // list goes too — it is the same record, kept apart only so browsing cannot churn it out.
    clearBrowserHistory: () =>
      set({ browserUrlHistory: [], webConversationHistory: [], workspaceDocHistory: [] })
  }
}
