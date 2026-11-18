# ShieldBlock Chrome Web Store Listing

Copy-paste material for the Chrome Web Store developer dashboard.

## Name (75 characters max)

```text
ShieldBlock - Ad & Tracker Blocker
```

## Summary (132 characters max)

```text
Blocks ads, trackers and third-party cookies, hides ad slots, and stubs anti-adblock scripts. No data collected.
```

## Detailed description

```text
ShieldBlock blocks ads, trackers and third-party cookies. It has no accounts, no sign-up, and collects no data.

Network blocking: ShieldBlock uses Chrome's built-in declarativeNetRequest engine to block requests to about 219,000 ad and tracking domains, built from curated seed lists, the StevenBlack hosts list, EasyList and EasyPrivacy, and AdGuard's list of CNAME-disguised trackers (tracking subdomains that pose as first-party).

Tracker blocking: A separate module blocks analytics, tag manager and social tracking requests, and provides stand-ins for tracker globals so pages that depend on them keep working.

Cookie protection: Removes third-party cookies from subresource requests, so cross-site tracking cookies are not sent.

Cosmetic filtering: Hides common ad containers on pages using injected CSS, and hides site-specific ad slots from EasyList on about 7,800 sites.

Anti-adblock stubs: Provides harmless stand-ins for common ad-script globals, so anti-adblock checks do not break page flows.

Per-site allowlist: Turn off blocking for the current site and its subdomains from the toolbar popup.

Per-module controls: Turn ads, trackers, cookie protection and cosmetic filtering on or off individually. A master switch disables everything.

Blocked count: The toolbar badge shows how many requests were blocked on the current tab.

Privacy: ShieldBlock does not collect, transmit, or sell any data. It has no analytics, no remote servers and no remote code. Settings are stored only on your device and are removed when you uninstall.

Open source: Code licensed under the MIT License. Blocklists from StevenBlack/hosts, AdGuard, EasyList and EasyPrivacy are used under their own licenses; see THIRD_PARTY_NOTICES.md in the repository. Source code and issue tracker: https://github.com/arminsalmasi/chrome-ad-blocker

Privacy policy: https://github.com/arminsalmasi/chrome-ad-blocker/blob/main/PRIVACY.md
```

## Category

Privacy & Security (or the closest equivalent in the current dashboard category list).

## Single purpose

```text
ShieldBlock blocks advertising, tracking and third-party cookie requests, and hides ad elements, on the websites you visit.
```

## Permission justifications

One entry per permission declared in manifest.json.

declarativeNetRequest:
```text
Required to block ad and tracker network requests and to strip third-party cookie headers. Filtering runs locally in Chrome's declarativeNetRequest engine using rulesets bundled in the extension. It also provides the per-tab blocked-request count shown on the toolbar badge.
```

scripting:
```text
Required to register content scripts with chrome.scripting.registerContentScripts. Cosmetic CSS, and per-site hiding scripts for sites with EasyList ad-slot rules, are injected to hide ad elements, and MAIN-world stub scripts are injected to keep pages working when a blocked tracker library is absent. Each script is registered only when its module is enabled, and is excluded on allowlisted sites.
```

storage:
```text
Required to save user settings (master switch, per-module toggles, and allowlisted domain names) in chrome.storage.local on the user's device.
```

activeTab:
```text
Required to call declarativeNetRequest.getMatchedRules for the tab the user is viewing when they open the popup, so the popup can show that tab's blocked-request count. Access is limited to the active tab and only when the user opens the popup.
```

Host permission <all_urls>:
```text
ShieldBlock blocks requests on every website, so it needs access to all sites. Declarative network rules that modify request headers (cookie stripping) and content scripts that hide ads and inject stubs must be able to run on any page the user visits. ShieldBlock does not read or transmit page content.
```

## Remote code

Are you using remote code? No, I am not using remote code.

Justification (one line):
```text
All JavaScript, CSS and filter rulesets are included in the uploaded package; the extension does not fetch or evaluate any code at runtime.
```

## Data usage disclosures

Data categories to tick: none. Leave all of the following unchecked:
- Personally identifiable information
- Health information
- Financial and payment information
- Authentication information
- Personal communications
- Location
- Web history
- User activity
- Website content

Certifications to check (all three):
- I do not sell or transfer user data to third parties, apart from approved use cases.
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

## Assets checklist

- [ ] Icon, 128x128: `icons/icon128.png`
- [ ] Screenshot 1, 1280x800: `store/screenshot-1.png`
- [ ] Screenshot 2, 1280x800: `store/screenshot-2.png`
- [ ] Small promo tile, 440x280: `store/promo-small.png`
- [ ] Upload package: `dist/shieldblock-<version>.zip` (built by `make package`)
- [ ] Privacy policy URL: `https://github.com/arminsalmasi/chrome-ad-blocker/blob/main/PRIVACY.md`

## Before submitting

- [ ] Bump `version` in `manifest.json` (currently `1.4.0`); the store rejects a version that has already been published.
- [ ] Run `make test`, `make check`, and `make package`.
- [ ] Unzip `dist/shieldblock-<version>.zip` and load it unpacked at `chrome://extensions` to smoke-test blocking, the popup, and the allowlist.
- [ ] Confirm the privacy policy URL above resolves on the `main` branch.
- [ ] Confirm the data usage disclosures and certifications above match the current build.
