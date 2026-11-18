# Site tests

A/B tests ShieldBlock against real websites. Each site in [sites.json](sites.json) is loaded in a fresh Chrome profile **without** and **with** the extension, and the two runs are compared.

A site **passes** when, with the extension:

- no request to a blocklisted domain completes (third-party-only entries count only when loaded from another site),
- no new uncaught page errors appear that the baseline run didn't have,
- the page keeps at least 70% of the baseline's visible text, and
- for sites marked `"video": true`, a `<video>` element is playing.

## Blocked-requests window test

`make window-test` (or `node blocked_window_test.js [url]`) loads Dailymotion with the extension, opens the real popup via `chrome.action.openPopup()`, clicks **View blocked requests**, and checks that the window opens as a separate popup for the right tab, its total matches the blocked requests Chrome reported, every host is blocklisted, filtering and expanding work, the list resets on navigation, and the log is removed when the tab closes.

## Run

```bash
make site-test                          # all sites
make site-test SITES="cnn dailymotion"  # selected site ids
```

Or directly: `cd tests/site && npm install && node site_test.js [site-id ...]`.

Requirements: network access and an installed Google Chrome (the extension is loaded through Chrome's DevTools `Extensions.loadUnpacked`, since branded Chrome ignores `--load-extension`).

| Variable | Default | Purpose |
|---|---|---|
| `CHROME` | macOS Google Chrome path | Chrome binary to use |
| `CONCURRENCY` | `3` | Sites tested in parallel |
| `OUT` | `tests/site/results` | Screenshots (`<id>-with.png`, `<id>-without.png`) and `report.json` |

The exit code is non-zero if any site fails. Results depend on live sites, your region, and consent banners, so this is not part of CI; run it before merging blocklist or scriptlet changes.
