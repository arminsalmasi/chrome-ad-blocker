# ShieldBlock - High-Performance Ad & Tracker Blocker (Manifest V3)

[![CI](https://github.com/arminsalmasi/chrome-ad-blocker/actions/workflows/ci.yml/badge.svg)](https://github.com/arminsalmasi/chrome-ad-blocker/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
![Manifest V3](https://img.shields.io/badge/Chrome-Manifest%20V3-red.svg)

**ShieldBlock** is a lightweight, privacy-focused Chrome Extension built on **Manifest V3 (MV3)**. It combines native `declarativeNetRequest` (DNR) domain filtering (~219,000 ad and tracker domains from StevenBlack, AdGuard, EasyList, and EasyPrivacy), cosmetic CSS element collapsing, site-specific element hiding (~7,800 sites), anti-adblock scriptlet defusers, and dynamic per-site allowlisting. It collects no data; see the [privacy policy](PRIVACY.md).

![ShieldBlock popup](store/screenshot-1.png)

---

## Key Features & Architecture

### 1. Network Blocking (DNR Engine)
- **Native Evaluation**: Requests are matched inside Chrome's DNR engine; no request interception runs in the service worker.
- **Modular Static Rulesets**:
  - `rules/ads.json`: About 84,000 ad, tracking, and malware domains in 85 rules: the hand-picked seed list (`scripts/sample_ads.txt`) merged with a snapshot of [StevenBlack/hosts](https://github.com/StevenBlack/hosts) (mixed upstream licenses, see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)), which unifies AdAway, URLHaus, and other curated hosts lists, plus [EasyList](https://easylist.to/) domain rules.
  - `rules/trackers.json`: About 135,000 tracker domains in 136 rules: telemetry, analytics, and session-replay seed lists, [EasyPrivacy](https://easylist.to/) domain rules, plus a snapshot of [AdGuard's CNAME-disguised trackers list](https://github.com/AdguardTeam/cname-trackers) (MIT, Adguard Software Ltd), i.e. first-party-looking subdomains such as `metrics.site.com` that alias a tracker. Matching is by hostname from a static list; no DNS lookups are performed.
  - `rules/cookie_protection.json`: Strips third-party `Cookie` and `Set-Cookie` headers from subresources only (scripts, images, XHR, media, fonts, etc.). Top-level and embedded frames keep their cookies, so iframes and logins keep working. Federated SSO, captcha, and payment domains (Google, Microsoft, Apple, GitHub, Okta, Auth0, Stripe, PayPal, hCaptcha, reCAPTCHA, Cloudflare challenges) are excluded.
- **Compiler**: `scripts/build_rules.py` converts hosts, plain-domain, and whole-domain Adblock Plus lists (including `$third-party` entries) into grouped DNR rules (1,000 domains per rule via `requestDomains`), so large lists stay well inside Chrome's 30,000 guaranteed static rules. See [Filter-List Compiler](#filter-list-compiler-scriptsbuild_rulespy).

### 2. Cosmetic Filtering (`content/cosmetic.css`, `content/cosmetic_sites/`)
- **Static Element Hiding**: `display: none !important` for common ad containers, Taboola/Outbrain/Revcontent/MGID widgets, `amp-ad`, and AdSense `amp-embed`.
- **Publisher Ad Slots**: Hides site-styled placeholder containers that stay visible after their ad is blocked (`.ad-slot`, `.ad-slot-container`, `.ad-slot-header__wrapper`, `.ad-slot__*`, `.container__ads`, `[data-ad-label-text]`).
- **Relational Selectors (`:has()`)**: Collapses `div`/`aside` wrappers left behind by blocked ad units (`.adsbygoogle`, `[id^="div-gpt-ad"]`, ad-network iframes, and similar), but only when every child element is ad content. Wrappers that also contain article text stay visible.
- **Site-Specific Hiding**: Plain-CSS `domain##selector` rules from [EasyList](https://easylist.to/) for about 7,800 sites (16,525 selectors), compiled by `scripts/build_cosmetics.py` into 64 buckets. Each bucket is registered only for its own sites, in the isolated content-script world, and honors EasyList `#@#` exceptions. Procedural, scriptlet, and generic selectors are not included.
- **Registration-Based Control**: Registered as a content-script stylesheet at `document_start` in all frames. It is only active while the Cosmetic Filtering module is enabled and the site is not allowlisted. Site-specific buckets follow the same toggle and allowlist.

### 3. Scriptlet Stubs & Anti-Adblock Defusers (`content/scriptlets_ads.js`, `content/scriptlets_trackers.js`)
Both files run in the page's own context (`world: "MAIN"`) at `document_start` in all frames.

**`scriptlets_ads.js`** (Ad Networks module):
- **Ad SDK Stubs**: No-op replacements for `adsbygoogle`, Google Publisher Tag (`googletag`), Prebid.js (`pbjs`), Amazon TAM (`apstag`), Taboola (`_taboola`), and Outbrain (`OBR`). Queued `googletag.cmd`/`pbjs.que` functions and `adsbygoogle.push` callbacks fire immediately. `window.google` is deliberately left untouched, because stubbing it breaks pages that feature-detect Google Sign-In or Maps.
- **Canary Flags**: Pins `canRunAds`, `canRunAdvertise`, `googleAdSenseLoaded` to `true` and `isAdBlockActive`, `adblockEnabled` to `false`. Page assignments are ignored.
- **Anti-Adblock Libraries**: Replaces `blockAdBlock`, `fuckAdBlock`, and `sniffAdBlock` with inert objects that report "not detected".
- **Bait Spoofing**: Intercepts `getComputedStyle` and `offsetHeight` for bait classes (`adsbox`, `ad-banner`, `pub_300x250`, `ad-placement`, `banner-ad`) so they report visible, non-zero dimensions.
- **Polling Defuser**: Replaces `setInterval` callbacks whose source references anti-adblock identifiers (`canRunAds`, `isAdBlockActive`, `blockAdBlock`, `fuckAdBlock`, `sniffAdBlock`) with an inert timer.

**`scriptlets_trackers.js`** (Trackers & Telemetry module): Stubs `dataLayer`, `gtag`, `ga`, `fbq`/`_fbq`, `twq`, `lintrk`, `ttq`, `hj`, `FS`, `mixpanel`, `analytics`, `clarity`, and `ym`, so page code does not throw when the real library is blocked. `ttq`, `FS`, `mixpanel`, and `analytics` are universal no-op proxies, so any method chain (for example `mixpanel.people.set()`) is safe. Callbacks passed to these APIs (`eventCallback`, `event_callback`, `hitCallback`, and analytics callbacks) fire immediately so purchase flows and buttons never stall.

### 4. Popup UI, Dynamic Allowlisting & Badge
- **Global Master Switch**: Disables all DNR rulesets, the allowlist rule, and all content scripts.
- **Per-Site Allowlist**: Adds a single dynamic `allowAllRequests` rule (priority 100) on `main_frame` covering all allowlisted domains. An entry also covers its subdomains. `www.` is stripped when an entry is added.
- **Granular Module Controls**: Independently toggle Ad Networks, Trackers & Telemetry, Third-Party Cookie Stripping, or Cosmetic Filtering.
- **Blocked Requests Window**: The popup's **View blocked requests** button opens a separate window listing every request blocked on the current tab, grouped by domain with counts and request types; expand a domain to see full URLs, filter by domain/URL/type, and watch it update live as the page loads. Collected read-only from `webRequest` errors (`net::ERR_BLOCKED_BY_CLIENT`) and kept in memory-only `chrome.storage.session`, cleared on navigation, tab close, and browser exit.
- **Blocked Request Counter**: The extension badge shows the native per-tab DNR match count (`displayActionCountAsBadgeText`), which works in packed builds. The popup count comes from `getMatchedRules` and only includes the Ad Networks and Trackers rulesets, so the two numbers can differ.

**State model**: `storage.local` is the single source of truth. The popup only writes to storage. The service worker reacts to `storage.onChanged` and runs one serialized sync that reconciles static rulesets, the allowlist rule, and registered content scripts. Changes apply on the next page load; the popup's **Reload Page to Apply** button reloads the active tab.

---

## Installation (Load Unpacked in Chrome)

1. Clone or download this repository.
2. Open Google Chrome and go to `chrome://extensions/`.
3. Enable **Developer mode** in the top-right corner.
4. Click **Load unpacked** and select the repository root directory.
5. Pin **ShieldBlock** to your Chrome toolbar.

**Requirements**: Chrome 119 or newer (`minimum_chrome_version`).

**Publishing to the Chrome Web Store**: run `make package` and upload `dist/shieldblock-<version>.zip`. Listing text, permission justifications, data-use answers, and a pre-submit checklist are in [STORE_LISTING.md](STORE_LISTING.md); the privacy policy is [PRIVACY.md](PRIVACY.md); graphics are in `store/` (regenerate with `make assets`).

**Permissions**: `declarativeNetRequest`, `scripting`, `storage`, `activeTab`, `webRequest`, and host access to `<all_urls>`. `activeTab` is used by the popup to read the match count for the current tab; `webRequest` is used read-only to list blocked requests in the blocked-requests window.

---

## Extension Controls & Usage

Click the **ShieldBlock** toolbar icon to access:

| Control | Type | Description |
| :--- | :--- | :--- |
| **Master Toggle** | Header switch | Disables all static rulesets, the allowlist rule, and all content scripts. Module toggles are disabled while off. |
| **Site Allowlist** | Domain card | Adds or removes the active domain (and its subdomains) from the allowlist. Applies on reload. |
| **Ad Networks** | Module | Controls `ruleset_ads` (`rules/ads.json`) and the ad scriptlets (`content/scriptlets_ads.js`). |
| **Trackers & Telemetry** | Module | Controls `ruleset_trackers` (`rules/trackers.json`) and the tracker stubs (`content/scriptlets_trackers.js`). |
| **Strip 3rd-Party Cookies** | Module | Controls `ruleset_cookies` (`rules/cookie_protection.json`). |
| **Cosmetic Filtering** | Module | Controls the cosmetic stylesheet (`content/cosmetic.css`) and the per-site hiding buckets (`content/cosmetic_sites/`). |
| **Badge Counter** | Status badge | Native per-tab count of matched DNR rules. |

---

## Filter-List Compiler (`scripts/build_rules.py`)

Compile hosts files, plain domain lists, or Adblock Plus lists into MV3 DNR rulesets. Domains are grouped into rules with `condition.requestDomains` (`--domains-per-rule`, default 1,000), which matches each domain and its subdomains like `||domain^`. Subdomains already covered by a listed parent are dropped. Requires Python 3.10+. `--input` is required and may be repeated.

**Accepted lines** block an entire domain: hosts entries (`0.0.0.0 example.com`), plain domains, and `||example.com^` with no options or only `$important`/`$all`. Rules with `$third-party` (or `$3p`) are kept and emitted with `condition.domainType: "thirdParty"`, so they block only requests from another site. Rules with `$popup`, `$document`, or type options are skipped, because the generated rule has no such restriction and would block more than the original.

**Skipped lines**: cosmetic and scriptlet filters (`##`, `#@#`, `#?#`, `#$#`, and similar), exceptions (`@@`), paths, wildcards, regexes, ports, and type- or domain-restricted options. These are never widened into site-wide blocks.

**Site-specific cosmetics** are compiled by `scripts/build_cosmetics.py` instead (`make cosmetics`). It keeps only `domain##selector` and `domain#@#selector` rules for explicit hostnames with plain CSS. Procedural and extended syntax (`:has-text`, `:xpath`, `:upward`, `+js`, ...), entity rules (`example.*`), regex domains, and generic rules are skipped. `--dump PATH` writes the filtered rules as a snapshot.

**Upstream aliases**: `stevenblack`, `adguard_dns`, `easylist`, `easyprivacy`, `cname_trackers` (`easylist` and `easyprivacy` resolve to easylist.to). Any `http(s)://` URL or local file path is also accepted.

**Exclusions**: `--exclude FILE` (repeatable) lists domains that must never be blocked. They are removed from the input and added to every rule as `excludedRequestDomains`, so a listed parent domain can't block them either. The build uses `scripts/exclude_domains.txt`; add a domain there when a blocklist entry breaks a site.

**Snapshots**: `--dump-domains PATH` writes the cleaned domain list instead of rules. Upstream lists are snapshotted into `scripts/lists/` so `make rules` is deterministic and works offline. A `.gz` path is written gzipped (byte-reproducible), and `.gz` inputs are read transparently. Third-party-only domains are written as `||domain^$third-party`, so the snapshot reads back unchanged.

Each generated file with a new prefix is a new ruleset. The compiler prints the `rule_resources` entries to add to `manifest.json`; new files are inert until added there.

```bash
# Compile from local seed lists
python3 scripts/build_rules.py -i scripts/sample_ads.txt -o rules -p custom_blocklist

# Compile from upstream lists, with exclusions
python3 scripts/build_rules.py \
  --input stevenblack \
  --input cname_trackers \
  --exclude scripts/exclude_domains.txt \
  --output-dir rules \
  --prefix blocklist
```

---

## Repository Structure

```text
├── manifest.json                  # Manifest V3 configuration, permissions, ruleset declarations
├── background.js                  # Service worker: state sync, allowlist rule, content script registration
├── Makefile                       # Build (rules), test, and check targets
├── LICENSE                        # MIT License (source code)
├── THIRD_PARTY_NOTICES.md         # Attribution and licenses for bundled blocklist data
├── PRIVACY.md                     # Privacy policy (linked from the Web Store listing)
├── STORE_LISTING.md               # Copy-paste Web Store listing, permission justifications, checklist
├── content/
│   ├── cosmetic.css               # Cosmetic element hiding and :has() collapse rules
│   ├── cosmetic_sites/            # Generated site-specific hiding: NN.js buckets + index.json (EasyList)
│   ├── scriptlets_ads.js          # Ad SDK stubs and anti-adblock defusers (MAIN world)
│   └── scriptlets_trackers.js     # Analytics and pixel stubs (MAIN world)
├── icons/
│   ├── icon16.png                 # Toolbar icon (16x16)
│   ├── icon32.png                 # High-DPI icon (32x32)
│   ├── icon48.png                 # Extensions management icon (48x48)
│   └── icon128.png                # Chrome Web Store icon (128x128)
├── popup/
│   ├── popup.html                 # Popup user interface
│   ├── popup.css                  # Dark-themed styling
│   └── popup.js                   # Writes settings to storage and handles toggle events
├── rules/
│   ├── ads.json                   # Static DNR rules: ad seed list + StevenBlack hosts + EasyList domain rules
│   ├── trackers.json              # Static DNR rules: tracker seed lists + AdGuard CNAME + EasyPrivacy domain rules
│   └── cookie_protection.json     # DNR modifyHeaders rules stripping third-party cookies
├── scripts/
│   ├── build_rules.py             # Python compiler converting filter lists into grouped DNR rulesets
│   ├── build_cosmetics.py         # Compiler for site-specific EasyList element hiding (content/cosmetic_sites/)
│   ├── exclude_domains.txt        # Domains never blocked (applied to every generated rule)
│   ├── lists/
│   │   ├── stevenblack.txt.gz     # Snapshot of StevenBlack/hosts (source for rules/ads.json)
│   │   ├── adguard_cname.txt.gz   # Snapshot of AdGuard CNAME trackers (source for rules/trackers.json)
│   │   ├── easylist_domains.txt.gz     # Snapshot of EasyList domain rules (source for rules/ads.json)
│   │   ├── easyprivacy_domains.txt.gz  # Snapshot of EasyPrivacy domain rules (source for rules/trackers.json)
│   │   └── easylist_cosmetic.txt.gz    # Snapshot of EasyList site-specific cosmetic rules (source for content/cosmetic_sites/)
│   ├── sample_ads.txt             # Seed list of ad network domains (source for rules/ads.json)
│   ├── sample_trackers.txt        # Seed list of tracker domains (source for rules/trackers.json)
│   ├── sample_cname.txt           # Known CNAME-cloaked tracker subdomains (source for rules/trackers.json)
│   └── render_assets.py           # Renders icons and Web Store graphics with headless Chrome
├── store/                         # Web Store screenshots (1280x800) and promo tile (440x280)
├── tests/
│   ├── site/                      # Real-site A/B test harness (make site-test; needs network, not in CI)
│   └── test_build_rules.py        # Unit tests for the compiler
└── .github/
    └── workflows/
        ├── ci.yml                 # CI: unit tests, syntax/JSON checks, rulesets and cosmetics match sources
        └── update-lists.yml       # Monthly upstream list refresh; opens a pull request
```

---

## Development

```bash
make rules         # Regenerate rules/ads.json, rules/trackers.json, and content/cosmetic_sites/ from local inputs (runs make cosmetics)
make cosmetics     # Regenerate content/cosmetic_sites/ from scripts/lists/easylist_cosmetic.txt.gz
make update-lists  # Download fresh snapshots (StevenBlack, AdGuard CNAME, EasyList, EasyPrivacy) into scripts/lists/, then make rules
make test          # Run the unittest suite in tests/
make check         # node --check on extension JS and JSON validation for manifest, rulesets, and site cosmetics
make window-test   # End-to-end test of the blocked-requests window on a real site
make site-test     # A/B test 14 real sites in installed Google Chrome (SITES="cnn ebay" to pick; CHROME=... to override)
make assets        # Re-render icons/ and store/ graphics (needs Google Chrome; CHROME=... to override)
make package       # Build dist/shieldblock-<version>.zip for Web Store upload (runtime files only)
```

CI runs `test`, `check`, and `rules` on pushes to `main` and on pull requests, and fails if `make rules` changes anything under `rules/` or `content/cosmetic_sites/`. After editing a seed list or the exclusion file, run `make rules` and commit the regenerated files. To pick up upstream changes, run `make update-lists` and commit `scripts/lists/` together with the regenerated outputs.

The `update-lists` workflow runs on the 1st of each month (06:00 UTC) and on demand. It refreshes the snapshots, runs `make test check`, and opens a pull request on `chore/update-lists-YYYY-MM-DD`. It then dispatches CI so the required `check` status runs. Run `make site-test` before merging that pull request.

---

## Limitations

- **Reload required**: Setting and allowlist changes apply on the next page load.
- **Scriptlets are not retroactive**: Stubs and defusers only take effect for documents loaded after they are registered. They cannot undo changes in an already-loaded page.
- **Frame coverage**: Content scripts run on `http://` and `https://` pages and, via `matchOriginAsFallback`, in `about:blank`/`srcdoc`/`blob:` frames those pages create. Other schemes (`file://`, `chrome://`, extension pages) are not covered.
- **Allowlist scope differs per layer**: Network rules are exempted for the whole tab when the top-level site is allowlisted. Content scripts are excluded per frame URL, so third-party iframes inside an allowlisted page (for example a payment or captcha frame) still get the stubs and cosmetic CSS.
- **IPv6 hosts** (`[::1]`) cannot be allowlisted. The toggle is disabled for them.
- **Badge vs. popup count**: The badge is Chrome's native count of blocked requests on the tab. The popup counts ad and tracker rule matches.
- **Cosmetic coverage is partial**: Site-specific hiding applies only EasyList's plain-CSS selectors for explicit hostnames. Procedural and extended selectors, scriptlet rules, and generic rules are not applied, so some empty ad slots stay visible.
- **YouTube ads are out of scope**: They are served first-party from youtube.com. Blocking them needs response-rewriting scriptlets that YouTube changes constantly.
- **Package size**: The bundled rulesets are about 7.9 MB (~219,000 domains in 221 rules, well within Chrome's 30,000 guaranteed static rules).
- **Lists are snapshots**: Blocklists update only when `make update-lists` is run and a new version is shipped; there are no over-the-air list updates.
- **CNAME coverage is list-based**: Disguised trackers are only caught if their exact subdomain is on AdGuard's list; new or unlisted CNAME aliases are not detected, because extensions cannot inspect DNS.

---

## Changelog

### 1.5.0
- **View blocked requests**: new popup button opens a separate window listing the current tab's blocked requests, grouped by domain (counts, types, expandable URLs), with a filter and live updates. Backed by read-only `webRequest` error observation (new `webRequest` permission, no extra install warning) and memory-only `storage.session`; reset when a new page's response arrives, removed when the tab closes; quota-safe per-tab writes.
- `APPROACH_CLAUDE.md` / `APPROACH_GEMINI.md` are no longer tracked (kept locally as design notes).
- `tests/site/blocked_window_test.js` (`make window-test`): drives the real popup on Dailymotion; 13/13 checks pass (window total matches Chrome's 33 blocked requests exactly).

### 1.4.0
- Blocklists expanded to ~219,000 domains in 221 rules: EasyList (ads) and EasyPrivacy (trackers) domain rules join StevenBlack and AdGuard CNAME. Seed list adds `oa.opera.com`.
- Compiler: `||domain^$third-party` rules are kept and enforced with `domainType: thirdParty` instead of skipped.
- Site-specific element hiding: `scripts/build_cosmetics.py` compiles EasyList `domain##selector` rules into 64 buckets (16,525 selectors for 7,786 sites) in `content/cosmetic_sites/`, registered per bucket under the Cosmetic Filtering toggle and allowlist.
- `make rules` depends on `make cosmetics`; `make update-lists` refreshes all five snapshots; new `make site-test`.
- New real-site A/B test harness in `tests/site/` (14 sites, installed Chrome; not in CI).
- Monthly `update-lists` workflow opens a refresh pull request; CI can be dispatched manually, and its drift check covers `content/cosmetic_sites/`.
- Consent managers (OneTrust/cookielaw, IAB `consensu.org`, InMobi/Quantcast CMPs, Cookiebot, Usercentrics, Didomi, TrustArc, Sourcepoint) are excluded from all lists: StevenBlack blocked them, which broke CNN's consent flow.
- Verified: 14/14 real sites pass the A/B test (news, video, embeds, shopping, checkout, sign-in, reference, social); e.g. CNN requests 914 → 177, Dailymotion 5,591 → 155 with the video playing ad-free.

### 1.3.1
- Network rules now block every request type to listed domains except top-level navigation (previously `other`, font, and stylesheet requests, such as Google IMA's `pubads.g.doubleclick.net/.../ima` fetch, got through).
- GPT (`googletag`) and Prebid (`pbjs`) stubs cover more of each API (`getConfig`, `setConfig`, targeting getters, events) and fall back to safe no-ops for anything else, fixing `getConfig is not a function` errors.
- Cosmetic: hides empty ad rails such as `[data-ad-zone]`, `[id^="display_ads_"]`, and `AdColumn__*` containers.
- Verified on dailymotion.com: page requests down ~89%, ad requests down from ~1,700 to 7 (all blocked), no pre-roll ads, no page errors.

### 1.3.0
- Blocklists expanded to ~150,000 domains: StevenBlack/hosts (ads) and AdGuard's CNAME-disguised trackers (trackers), grouped into ~150 DNR rules via `requestDomains`, with reproducible gzipped snapshots in `scripts/lists/`.
- Compiler: `--exclude` never-block list, `--dump-domains` snapshots, subdomain collapsing.
- Cosmetic: hides publisher ad-slot placeholders, guarded against containers with editorial content.
- Chrome Web Store prep: new icon set, screenshots and promo tile (`make assets`), privacy policy, store listing, `make package`.
- Third-party notices for bundled list data; MIT license scoped to source code.

### 1.2.0
- Scriptlets and cosmetic CSS registered at runtime via `chrome.scripting` (MAIN world, `document_start`, all frames incl. `about:blank`/`srcdoc`), gated per module and excluded on allowlisted sites; removed `web_accessible_resources`.
- Native DNR badge counts and `getMatchedRules` popup count (works in packed builds); dropped `declarativeNetRequestFeedback`.
- Single dynamic allowlist rule with subdomain-consistent matching; serialized, storage-driven sync.
- Compiler no longer widens cosmetic, path, exception, or option-scoped filters into whole-domain blocks.
- Safer scriptlets (no scroll-unlock hack, no `window.google` stub, non-throwing pinned flags, no-op SDK proxies); cookie stripping limited to subresources.
- LICENSE, Makefile, unit tests, and GitHub Actions CI.

### 1.1.0
- Initial release: DNR ad/tracker/cookie rulesets, cosmetic filtering, anti-adblock scriptlets, per-site allowlist, popup with per-module toggles.

---

## Contributing

`main` is protected: force-pushes and branch deletion are blocked, history must stay linear, and the `check` CI job must pass. Open a pull request from a feature branch, and run `make test check` (and `make rules` if you touched a list) before pushing. For rule or cosmetic changes, also run `make site-test` (needs network and Google Chrome). To report a site that breaks, open an issue with the URL and which module (Ads, Trackers, Cookies, Cosmetic) fixes it when turned off.

---

## License

The **source code** is licensed under the [MIT License](LICENSE).

The **blocklist data** in `rules/ads.json`, `rules/trackers.json`, `content/cosmetic_sites/`, and `scripts/lists/` is derived from [StevenBlack/hosts](https://github.com/StevenBlack/hosts), [AdGuard's CNAME trackers list](https://github.com/AdguardTeam/cname-trackers), and [EasyList and EasyPrivacy](https://easylist.to/), and stays under their upstream licenses. These include CC BY, CC BY-SA, GPLv3, and **non-commercial** (CC BY-NC-SA) terms. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for attribution, per-source licenses, and how to rebuild a list from permissively licensed sources only.
