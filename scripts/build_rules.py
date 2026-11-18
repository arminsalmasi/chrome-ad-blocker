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
    r'^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$'
)

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
    line = raw_line.strip()
    if not line or line.startswith("#") or line.startswith("!"):
        return None

    # Handle hosts file format (0.0.0.0 domain or 127.0.0.1 domain)
    parts = line.split()
    if len(parts) >= 2 and parts[0] in ("0.0.0.0", "127.0.0.1"):
        candidate = parts[1].strip()
    else:
        candidate = parts[0].strip()

    # Strip ABP modifiers like $third-party,image
    if "$" in candidate:
        candidate = candidate.split("$")[0]

    # Handle ABP style ||domain^
    if candidate.startswith("||"):
        candidate = candidate[2:]
    if candidate.endswith("^"):
        candidate = candidate[:-1]

    # Strip port, path, anchor or trailing comments
    candidate = candidate.split("#")[0].split(":")[0].split("/")[0].strip().lower()

    if candidate in IGNORED_HOSTS or not candidate:
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


def build_dnr_rules(domains: list[str], start_id: int = 1, resource_types: list[str] = None) -> list[dict]:
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

    if args.max_rules_per_file <= 0:
        parser.error("--max-rules-per-file must be greater than 0")

    sources = args.input or ["scripts/sample_hosts.txt"]
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

    for index, chunk in enumerate(chunks, start=1):
        filename = f"{args.prefix}_{index}.json" if len(chunks) > 1 else f"{args.prefix}.json"
        out_path = os.path.join(args.output_dir, filename)
        rules = build_dnr_rules(chunk, start_id=rule_id)
        rule_id += len(rules)

        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(rules, f, indent=2)

        print(f"Wrote {len(rules)} rules to {out_path}")


if __name__ == "__main__":
    main()
