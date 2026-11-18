# ShieldBlock Privacy Policy

Effective date: 2026-11-18

ShieldBlock is a Chrome extension that blocks ads, trackers and third-party cookies. It does not collect, transmit, store off-device, or sell any user data.

## What ShieldBlock does not do

- No analytics, telemetry, or crash reporting.
- No remote servers. ShieldBlock does not contact any server operated by the developer or a third party.
- No remote code. All code and filter rules are included in the extension package.
- No page content. ShieldBlock does not read, copy, or store the content of web pages you visit.
- No sharing with third parties.

## What is stored, and where

ShieldBlock stores its settings in `chrome.storage.local` on your device. These settings are:

- The master on/off switch and per-module toggles (ads, trackers, cookies, cosmetic filtering).
- Domain names you have allowlisted.

These settings never leave your device. They are deleted when you uninstall the extension.

## How blocking works

Filtering is performed locally by Chrome's built-in `declarativeNetRequest` engine. The toolbar badge shows the number of requests blocked on the current tab. This count is computed by Chrome on your device and is not transmitted anywhere.

## Blocked-request list

To power the **View blocked requests** window, ShieldBlock notes the address, type and time of each request that was blocked in a tab (it observes Chrome's `webRequest` errors; it cannot see request or response contents). This list:

- is kept only in `chrome.storage.session`, which lives in memory and is never written to disk or synced,
- is cleared when the tab loads a new page, when the tab is closed, and when the browser exits,
- is shown only to you in the extension's own window and is never transmitted anywhere.

## Permissions

ShieldBlock requests the permissions it needs to block requests and apply page styling on websites. These permissions are used only for the purposes described above.

## Changes to this policy

If this policy changes, the updated version will be published in this repository with a new effective date.

## Contact

Questions or concerns: open an issue at https://github.com/arminsalmasi/chrome-ad-blocker/issues
