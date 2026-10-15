import type { PreloadApi } from '../../../../preload/api-types'
import type { BrowserReadPageTextResult } from '../../../../shared/browser-page-text'
import { translate } from '@/i18n/i18n'
import { noopUnsubscribe } from './web-storage'

export function createBrowserApi(): NonNullable<Partial<PreloadApi>['browser']> {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: this client implements a subset of the desktop's browser surface and every member it does implement refuses rather than emulates, so skipping conformance here cannot hand the renderer a capability the client lacks. The rule reports the closing cast on this literal's opening brace.
  return {
    registerGuest: () => Promise.resolve(false),
    isGuestRegistered: () => Promise.resolve(false),
    repairGuestRegistration: () => Promise.resolve(false),
    unregisterGuest: () => Promise.resolve(),
    openDevTools: () => Promise.resolve(false),
    setViewportOverride: () => Promise.resolve(false),
    reportViewportScrollState: () => {},
    setAnnotationViewportBridge: () => Promise.resolve(false),
    // A web client never hosts pages, so it has no lease to publish over.
    publishClientPageMetadata: () => Promise.resolve({ status: 'refused' as const }),
    onGuestLoadFailed: () => noopUnsubscribe,
    onCertificateFailureChanged: () => noopUnsubscribe,
    proceedCertificate: () => Promise.resolve({ ok: false, reason: 'missing' }),
    onPermissionDenied: () => noopUnsubscribe,
    onPopup: () => noopUnsubscribe,
    onDownloadRequested: () => noopUnsubscribe,
    onDownloadProgress: () => noopUnsubscribe,
    onDownloadFinished: () => noopUnsubscribe,
    onContextMenuRequested: () => noopUnsubscribe,
    onContextMenuDismissed: () => noopUnsubscribe,
    onNavigationUpdate: () => noopUnsubscribe,
    onActivateView: () => noopUnsubscribe,
    onPaneFocus: () => noopUnsubscribe,
    onOpenLinkInOrcaTab: () => noopUnsubscribe,
    cancelDownload: () => Promise.resolve(false),
    setGrabMode: () =>
      Promise.resolve({
        ok: false,
        error: translate(
          'auto.web.web.preload.api.31bea294d5',
          'Grab mode is unavailable in the web client.'
        )
      }),
    awaitGrabSelection: () =>
      Promise.resolve({
        ok: false,
        error: translate(
          'auto.web.web.preload.api.31bea294d5',
          'Grab mode is unavailable in the web client.'
        )
      }),
    cancelGrab: () => Promise.resolve(false),
    captureSelectionScreenshot: () =>
      Promise.resolve({
        ok: false,
        error: translate(
          'auto.web.web.preload.api.8dfcb7a351',
          'Selection screenshots are unavailable in the web client.'
        )
      }),
    extractHoverPayload: () =>
      Promise.resolve({
        ok: false,
        error: translate(
          'auto.web.web.preload.api.275a776357',
          'Hover extraction is unavailable in the web client.'
        )
      }),
    // Why refused rather than emulated: this client hosts no guest, so there is no page to read —
    // the reader's own browser is the only place that conversation exists, and nothing here can see it.
    readPageText: (): Promise<BrowserReadPageTextResult> =>
      Promise.resolve({ ok: false, reason: 'unavailable' }),
    onGrabModeToggle: () => noopUnsubscribe,
    onGrabActionShortcut: () => noopUnsubscribe,
    sessionListProfiles: () => Promise.resolve([]),
    // Web clients render remote workspaces through the server; no local SSH routing exists.
    prepareSshWorkspacePartition: () =>
      Promise.reject(new Error('browser_local_route_unavailable')),
    sessionCreateProfile: () => Promise.resolve(null),
    sessionDeleteProfile: () => Promise.resolve(false),
    sessionImportCookies: () =>
      Promise.resolve({
        ok: false,
        summary: null,
        error: translate(
          'auto.web.web.preload.api.67ec964791',
          'Cookie import is unavailable in the web client.'
        )
      }),
    sessionResolvePartition: () => Promise.resolve(null),
    sessionDetectBrowsers: () => Promise.resolve([]),
    sessionDetectBrowsersForClientHost: () => Promise.resolve(null),
    sessionImportFromBrowserForClientHost: () => Promise.resolve(null),
    sessionClientRouteImportSources: () => Promise.resolve({}),
    sessionImportFromBrowser: () =>
      Promise.resolve({
        ok: false,
        summary: null,
        error: translate(
          'auto.web.web.preload.api.67ec964791',
          'Cookie import is unavailable in the web client.'
        )
      }),
    sessionClearDefaultCookies: () => Promise.resolve(false),
    sitePermissionsList: () => Promise.resolve([]),
    sitePermissionsSet: () => Promise.resolve([]),
    notifyActiveTabChanged: () => Promise.resolve(false)
  } as unknown as NonNullable<Partial<PreloadApi>['browser']>
}

export function createEmulatorApi(): NonNullable<Partial<PreloadApi>['emulator']> {
  return {
    onPaneFocus: () => noopUnsubscribe,
    onAutoAttach: () => noopUnsubscribe,
    startFrameStream: () => Promise.reject(new Error('Mobile emulator is unavailable on web.')),
    stopFrameStream: () => Promise.resolve(),
    onFrameStreamFrame: () => noopUnsubscribe,
    onFrameStreamError: () => noopUnsubscribe
  } as unknown as NonNullable<Partial<PreloadApi>['emulator']>
}
