import { PAGE_TEXT_RAW_CHAR_BUDGET } from '../../shared/browser-page-text'

// ---------------------------------------------------------------------------
// Guest script — read a page's text
//
// Runs in the guest through `executeJavaScript` and returns the page's readable
// text. It reads no attribute, no storage and no cookie: only what is on screen.
// ---------------------------------------------------------------------------

/**
 * Why an async IIFE: `executeJavaScript` must unwrap an engine promise. On a page that replaces the
 * global `Promise` — Angular's ZoneAwarePromise, for one — a bare `new Promise(...)` crosses the
 * boundary as its raw wrapper object instead of the resolved value.
 */
export const READ_PAGE_TEXT_SCRIPT = `(async function() {
  'use strict';
  try {
    // Why a container rather than the body: a conversation site keeps navigation, account chrome
    // and its own controls in the body, and the conversation is inside one of these. The fallback
    // keeps a site that uses none of them readable rather than empty.
    var container = document.querySelector('main, [role="main"], article') || document.body;
    var text = container ? (container.innerText || '') : '';
    if (text.trim().length < 200 && document.body) {
      var bodyText = document.body.innerText || '';
      if (bodyText.length > text.length) {
        text = bodyText;
      }
    }
    return {
      url: String(location.href || ''),
      title: String(document.title || ''),
      // Why a cap here as well as in main: this is what crosses the bridge, and a transcript page
      // can hold far more text than the clamp and the prompt have any use for.
      text: text.slice(0, ${PAGE_TEXT_RAW_CHAR_BUDGET})
    };
  } catch (error) {
    return null;
  }
})()`
