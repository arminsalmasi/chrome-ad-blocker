#!/usr/bin/env python3
"""
Filter-List to Chrome DeclarativeNetRequest (DNR) Ruleset Compiler.

Parses hosts files (0.0.0.0 / 127.0.0.1 domain), Adblock Plus style (||domain^),
or plain domain-per-line lists, validates and deduplicates domains, and generates
Manifest V3 DNR rulesets split into chunks <= 30,000 rules per file.
"""

import argparse
import json
import os
import re
import sys
import urllib.request
import urllib.error

DOMAIN_REGEX = re.compile(
    r'^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$'
)

# ABP/uBO cosmetic, scriptlet and HTML-filter separators. Lines containing these
# hide elements on a site; they must never become network block rules.
COSMETIC_MARKERS = ("##", "#@#", "#?#", "#$#", "#%#", "#@$#", "#@?#", "$$", "$@$")

# Only options that don't narrow the rule may be dropped. "$third-party" is NOT
# safe: emitting "||domain^" without it would also block first-party loads.
SAFE_ABP_OPTIONS = {"all", "important"}

DNR_MAX_RULES_PER_RULESET = 30000

IGNORED_HOSTS = {
    "localhost", "localhost.localdomain", "broadcasthost",
    "local", "0.0.0.0", "127.0.0.1", "255.255.255.255", "::1"
}

POPULAR_UPSTREAM_LISTS = {
    "stevenblack": "https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts",
    "adguard_dns": "https://adguardteam.github.io/HostlistsRegistry/assets/filter_1.txt",
    "easylist": "https://v.firebog.net/hosts/Easylist.txt",
    "easyprivacy": "https://v.firebog.net/hosts/Easyprivacy.txt",
    "cname_trackers": "https://raw.githubusercontent.com/AdguardTeam/cname-trackers/master/data/combined_disguised_trackers.txt"
}


def clean_domain(raw_line: str) -> str | None:
    """Return a bare domain if the line blocks an entire domain, else None.

    Accepts hosts entries ("0.0.0.0 example.com"), plain domains, and ABP
    domain anchors ("||example.com^", optionally with safe options). Rejects
    anything narrower than a full domain (paths, cosmetic filters, regexes,
    exceptions, type-restricted options) so it is never widened into a
    site-wide block.
    """
    line = raw_line.strip()
    if not line or line.startswith(("#", "!", "[", "@@")):
        return None
    if any(marker in line for marker in COSMETIC_MARKERS):
        return None

    # Drop trailing inline comments ("example.com # note").
    line = re.split(r"\s+#", line, maxsplit=1)[0].strip()

    parts = line.split()
    if len(parts) >= 2 and parts[0] in ("0.0.0.0", "127.0.0.1", "::", "::1"):
        candidate = parts[1]
    elif len(parts) == 1:
        candidate = parts[0]
    else:
        return None

    is_abp = candidate.startswith("||")
    if "$" in candidate:
        candidate, options = candidate.split("$", 1)
        opts = {o.strip().lower() for o in options.split(",") if o.strip()}
        if not opts <= SAFE_ABP_OPTIONS:
            return None

    if is_abp:
        candidate = candidate[2:]
        if candidate.endswith("^"):
            candidate = candidate[:-1]
        elif candidate.endswith("^|"):
            candidate = candidate[:-2]

    # Anything left that narrows the match (path, wildcard, regex, port,
    # separator) means this rule is not a whole-domain block.
    if any(ch in candidate for ch in "/*^|:?=&%"):
        return None

    candidate = candidate.strip().lower().rstrip(".")
    if not candidate or candidate in IGNORED_HOSTS:
        return None

    if DOMAIN_REGEX.match(candidate):
        return candidate
    return None


def fetch_or_read_file(source: str) -> list[str]:
    # Check for known alias
    if source.lower() in POPULAR_UPSTREAM_LISTS:
        source = POPULAR_UPSTREAM_LISTS[source.lower()]

    if source.startswith("http://") or source.startswith("https://"):
        print(f"Downloading upstream list from: {source}")
        req = urllib.request.Request(source, headers={"User-Agent": "Chrome-AdBlocker-Compiler/1.0"})
        try:
            with urllib.request.urlopen(req, timeout=20) as resp:
                content = resp.read().decode("utf-8", errors="ignore")
                return content.splitlines()
        except Exception as e:
            print(f"Error downloading {source}: {e}", file=sys.stderr)
            raise
    elif os.path.exists(source):
        print(f"Reading local list: {source}")
        with open(source, "r", encoding="utf-8", errors="ignore") as f:
            return f.readlines()
    else:
        raise FileNotFoundError(f"Input file not found: {source}")


def build_dnr_rules(domains: list[str], start_id: int = 1, resource_types: list[str] | None = None) -> list[dict]:
    if resource_types is None:
        resource_types = ["script", "image", "xmlhttprequest", "sub_frame", "ping", "media", "websocket"]

    rules = []
    for idx, domain in enumerate(domains, start=start_id):
        rules.append({
            "id": idx,
            "priority": 1,
            "action": {"type": "block"},
            "condition": {
                "urlFilter": f"||{domain}^",
                "resourceTypes": resource_types
            }
        })
    return rules


def main():
    parser = argparse.ArgumentParser(description="Compile domain blocklists into Chrome DNR rulesets")
    parser.add_argument("--input", "-i", action="append", help="Input file path, URL, or alias (stevenblack, easylist, easyprivacy, adguard_dns)")
    parser.add_argument("--output-dir", "-o", default="rules", help="Output directory for JSON rulesets")
    parser.add_argument("--max-rules-per-file", "-m", type=int, default=30000, help="Max rules per file (default: 30000)")
    parser.add_argument("--prefix", "-p", default="blocklist", help="Filename prefix for generated rules")
    args = parser.parse_args()

    if not 0 < args.max_rules_per_file <= DNR_MAX_RULES_PER_RULESET:
        parser.error(f"--max-rules-per-file must be between 1 and {DNR_MAX_RULES_PER_RULESET}")

    if not args.input:
        parser.error("at least one --input is required")
    sources = args.input
    all_domains = set()

    for src in sources:
        try:
            lines = fetch_or_read_file(src)
        except Exception as err:
            print(f"Failed to process source '{src}': {err}", file=sys.stderr)
            sys.exit(1)

        count = 0
        for line in lines:
            dom = clean_domain(line)
            if dom:
                all_domains.add(dom)
                count += 1
        print(f"  Parsed {count} valid entries from {src}")

    sorted_domains = sorted(all_domains)
    total_domains = len(sorted_domains)
    print(f"\nTotal unique domains: {total_domains}")

    os.makedirs(args.output_dir, exist_ok=True)
    chunk_size = args.max_rules_per_file
    rule_id = 1
    chunks = [sorted_domains[i:i + chunk_size] for i in range(0, total_domains, chunk_size)]

    if not chunks:
        chunks = [[]]

    written = []
    for index, chunk in enumerate(chunks, start=1):
        filename = f"{args.prefix}_{index}.json" if len(chunks) > 1 else f"{args.prefix}.json"
        out_path = os.path.join(args.output_dir, filename)
        rules = build_dnr_rules(chunk, start_id=rule_id)
        rule_id += len(rules)

        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(rules, f, indent=2)
            f.write("\n")

        written.append(out_path)
        print(f"Wrote {len(rules)} rules to {out_path}")

    # New ruleset files are inert until declared in manifest.json.
    print("\nEnsure these entries exist in manifest.json -> declarative_net_request.rule_resources:")
    for path in written:
        ruleset_id = "ruleset_" + os.path.splitext(os.path.basename(path))[0]
        print(json.dumps({"id": ruleset_id, "enabled": True, "path": path.replace(os.sep, "/")}))


if __name__ == "__main__":
    main()
