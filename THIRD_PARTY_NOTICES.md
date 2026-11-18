# Third-Party Notices

ShieldBlock's **source code** is licensed under the [MIT License](LICENSE).

The **blocklist data** is not ShieldBlock's own work. The following files contain
or are derived from third-party lists and remain under those lists' licenses:

| File | Derived from |
|---|---|
| `scripts/lists/stevenblack.txt.gz` | StevenBlack/hosts (unified hosts file) |
| `rules/ads.json` | `scripts/sample_ads.txt` (ShieldBlock) + StevenBlack/hosts + EasyList |
| `scripts/lists/adguard_cname.txt.gz` | AdGuard CNAME-disguised trackers list |
| `rules/trackers.json` | `scripts/sample_trackers.txt`, `scripts/sample_cname.txt` (ShieldBlock) + AdGuard CNAME list + EasyPrivacy |
| `scripts/lists/easylist_domains.txt.gz` | EasyList (ad domain rules) |
| `scripts/lists/easyprivacy_domains.txt.gz` | EasyPrivacy (tracker domain rules) |
| `scripts/lists/easylist_cosmetic.txt.gz` | EasyList (site-specific element hiding rules) |
| `content/cosmetic_sites/*` | EasyList (site-specific element hiding rules) |

Because some upstream sources carry **ShareAlike** and **NonCommercial** terms,
`rules/ads.json` and `scripts/lists/stevenblack.txt.gz` must not be used
commercially and must be redistributed under compatible terms with this
attribution. The EasyList and EasyPrivacy derived files are ShareAlike; see
[EasyList and EasyPrivacy](#easylist-and-easyprivacy). If you need data free of
those terms, rebuild the ad list from only the permissively licensed sources
below, without the EasyList and EasyPrivacy inputs (the per-source files are in
the StevenBlack repository under `data/<source>/hosts`).

---

## StevenBlack/hosts

- Project: https://github.com/StevenBlack/hosts
- Snapshot: `scripts/lists/stevenblack.txt.gz` (see the `# Source:` header for the exact URL)

The unified hosts file is a compilation published under the MIT License (below).
It aggregates the following sources, each under its own license as listed by the
StevenBlack project:

| Source | Home page | License |
|---|---|---|
| Steven Black's ad-hoc list | https://github.com/StevenBlack/hosts | MIT |
| AdAway | https://adaway.org/ | CC BY 3.0 |
| add.2o7Net, add.Dead, add.Risk, add.Spam, UncheckyAds (FadeMind) | https://github.com/FadeMind/hosts.extras | MIT |
| Badd Boyz Hosts (Mitchell Krog) | https://github.com/mitchellkrogza/Badd-Boyz-Hosts | MIT |
| hostsVN | https://github.com/bigdargon/hostsVN | MIT |
| KADhosts | https://kadantiscam.netlify.app/ | CC BY-SA 4.0 |
| minecraft-hosts | https://github.com/jamiemansfield/minecraft-hosts | CC0 1.0 |
| MVPS hosts file | https://winhelp2002.mvps.org/ | CC BY-NC-SA 4.0 |
| someonewhocares (Dan Pollock) | https://someonewhocares.org/hosts/ | Non-commercial use with attribution |
| Tiuxo hostlist (ads) | https://github.com/tiuxo/hosts | CC BY 4.0 |
| yoyo.org ad servers (Peter Lowe) | https://pgl.yoyo.org/adservers/ | No license stated; see the site's terms |

Creative Commons license texts:
[CC BY 3.0](https://creativecommons.org/licenses/by/3.0/),
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/),
[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/),
[CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/),
[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/).
Changes made by ShieldBlock: entries were parsed, lowercased, de-duplicated,
filtered to whole-domain blocks, collapsed under listed parent domains, and
converted to Chrome declarativeNetRequest rules.

```text
The MIT License (MIT)

Copyright © 2026 Steven Black

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the “Software”), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies
of the Software, and to permit persons to whom the Software is furnished to do
so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```

---

## AdGuard CNAME-disguised trackers

- Project: https://github.com/AdguardTeam/cname-trackers
- Snapshot: `scripts/lists/adguard_cname.txt.gz`
- Changes made by ShieldBlock: same processing as above.

```text
Copyright 2021 Adguard Software Ltd

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies
of the Software, and to permit persons to whom the Software is furnished to do
so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## EasyList and EasyPrivacy

- Project: [easylist.to](https://easylist.to/)
- Snapshots: `scripts/lists/easylist_domains.txt.gz` (ad domain rules), `scripts/lists/easyprivacy_domains.txt.gz` (tracker domain rules), and `scripts/lists/easylist_cosmetic.txt.gz` (site-specific element hiding rules). The `# Source:` header of each file gives the exact URL.
- Derived files: `rules/ads.json`, `rules/trackers.json`, `content/cosmetic_sites/*`, and the three snapshots above.
- License: dual licensed under the GNU General Public License v3 or later ([GPLv3](https://www.gnu.org/licenses/gpl-3.0.html)) and the Creative Commons Attribution-ShareAlike 3.0 license ([CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/)). License page: [easylist.to/pages/licence.html](https://easylist.to/pages/licence.html).
- ShieldBlock distributes the derived data under **CC BY-SA 3.0**. ShareAlike therefore applies to the derived files listed above: redistributed versions must keep that licence and credit the EasyList authors.
- Changes made by ShieldBlock: entries were parsed and lowercased. Network rules were filtered to whole-domain entries (plain domains, hosts entries, and `||domain^`, with `$third-party` kept as a third-party-only condition); all other filters were dropped. Cosmetic rules were filtered to plain-CSS `domain##selector` rules for explicit hostnames, with matching `domain#@#selector` exceptions applied. Entries were de-duplicated, collapsed under listed parent domains, and converted to Chrome declarativeNetRequest rules and per-site content scripts.
- Attribution: The EasyList authors ([easylist.to](https://easylist.to/)).
