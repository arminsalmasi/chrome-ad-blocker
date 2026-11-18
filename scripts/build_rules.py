#!/usr/bin/env python3
"""
Filter-List to Chrome DeclarativeNetRequest (DNR) Ruleset Compiler.

Parses hosts files (0.0.0.0 / 127.0.0.1 domain), Adblock Plus style (||domain^),
or plain domain-per-line lists, validates and deduplicates domains, and generates
Manifest V3 DNR rulesets split into chunks <= 30,000 rules per file.
"""

import argparse
import contextlib
import gzip
import io
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

# Only options that don't narrow the rule may be dropped. "$third-party" is
# not dropped: it is kept and emitted as condition.domainType = "thirdParty".
SAFE_ABP_OPTIONS = {"all", "important"}
THIRD_PARTY_OPTIONS = {"third-party", "3p"}

DNR_MAX_RULES_PER_RULESET = 30000
DEFAULT_DOMAINS_PER_RULE = 1000

IGNORED_HOSTS = {
    "localhost", "localhost.localdomain", "broadcasthost",
    "local", "0.0.0.0", "127.0.0.1", "255.255.255.255", "::1"
}

POPULAR_UPSTREAM_LISTS = {
    "stevenblack": "https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts",
    "adguard_dns": "https://adguardteam.github.io/HostlistsRegistry/assets/filter_1.txt",
    "easylist": "https://easylist.to/easylist/easylist.txt",
    "easyprivacy": "https://easylist.to/easylist/easyprivacy.txt",
    "cname_trackers": "https://raw.githubusercontent.com/AdguardTeam/cname-trackers/master/data/combined_disguised_trackers_justdomains.txt"
}


def clean_domain(raw_line: str) -> str | None:
    """Return a bare domain if the line blocks an entire domain for every
    initiator, else None. Third-party-only rules return None here; use
    parse_rule() to get them with their flag."""
    parsed = parse_rule(raw_line)
    return parsed[0] if parsed and not parsed[1] else None


def parse_rule(raw_line: str) -> tuple[str, bool] | None:
    """Parse a whole-domain block rule into (domain, third_party_only).

    Accepts hosts entries ("0.0.0.0 example.com"), plain domains, and ABP
    domain anchors ("||example.com^") with no options, safe options
    ($important, $all), or $third-party/$3p (third_party_only=True). Rejects
    anything narrower than a full domain (paths, cosmetic filters, regexes,
    exceptions, type- or domain-restricted options) so it is never widened.
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
    third_party = False
    if "$" in candidate:
        candidate, options = candidate.split("$", 1)
        opts = {o.strip().lower() for o in options.split(",") if o.strip()}
        if not opts <= SAFE_ABP_OPTIONS | THIRD_PARTY_OPTIONS:
            return None
        third_party = bool(opts & THIRD_PARTY_OPTIONS)

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
        return candidate, third_party
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
        opener = gzip.open if source.endswith(".gz") else open
        with opener(source, "rt", encoding="utf-8", errors="ignore") as f:
            return f.readlines()
    else:
        raise FileNotFoundError(f"Input file not found: {source}")


def collapse_subdomains(domains: set[str]) -> list[str]:
    """Drop domains already covered by a listed parent (requestDomains matches
    subdomains), e.g. "ads.x.com" is redundant when "x.com" is listed."""
    kept = []
    for domain in sorted(domains):
        labels = domain.split(".")
        if any(".".join(labels[i:]) in domains for i in range(1, len(labels) - 1)):
            continue
        kept.append(domain)
    return kept


def build_dnr_rules(
    domains: list[str],
    start_id: int = 1,
    domains_per_rule: int = DEFAULT_DOMAINS_PER_RULE,
    excluded: list[str] | None = None,
    resource_types: list[str] | None = None,
    third_party_only: bool = False,
) -> list[dict]:
    """Group domains into block rules via condition.requestDomains.

    One rule per domain would exhaust Chrome's 30,000 guaranteed static rules
    with a single large list; grouping keeps ~100k domains to ~100 rules.
    requestDomains matches the domain and its subdomains, like "||domain^".
    """
    rules = []
    for offset in range(0, len(domains), domains_per_rule):
        condition = {"requestDomains": domains[offset:offset + domains_per_rule]}
        # Omitting resourceTypes matches every type except main_frame, so
        # "other"/font/stylesheet requests to ad domains are blocked too, while
        # visiting a listed domain directly still works.
        if resource_types:
            condition["resourceTypes"] = resource_types
        if excluded:
            condition["excludedRequestDomains"] = excluded
        if third_party_only:
            condition["domainType"] = "thirdParty"
        rules.append({
            "id": start_id + len(rules),
            "priority": 1,
            "action": {"type": "block"},
            "condition": condition,
        })
    return rules


def read_domains(sources: list[str], strict: bool = False) -> set[str]:
    """Parse sources into domains. strict=True warns about every non-comment
    line that isn't a plain domain (used for exclusion files, where a silently
    ignored line would leave a site blocked that the user meant to exempt)."""
    domains = set()
    for src in sources:
        lines = fetch_or_read_file(src)
        count = 0
        for line in lines:
            dom = clean_domain(line)
            if dom:
                domains.add(dom)
                count += 1
            elif strict and line.strip() and not line.lstrip().startswith(("#", "!")):
                print(f"  WARNING: ignored invalid entry in {src}: {line.strip()!r} "
                      "(use a bare domain such as example.com)", file=sys.stderr)
        print(f"  Parsed {count} valid entries from {src}")
    return domains


def read_rules(sources: list[str]) -> tuple[set[str], set[str]]:
    """Parse sources into (blocked domains, third-party-only domains)."""
    plain, third = set(), set()
    for src in sources:
        count = 0
        for line in fetch_or_read_file(src):
            parsed = parse_rule(line)
            if parsed:
                (third if parsed[1] else plain).add(parsed[0])
                count += 1
        print(f"  Parsed {count} valid entries from {src}")
    return plain, third


def covered_by(domain: str, parents: set[str]) -> bool:
    """True if domain equals, or is a subdomain of, any entry in parents."""
    labels = domain.split(".")
    return any(".".join(labels[i:]) in parents for i in range(len(labels) - 1))


def apply_exclusions(domains: set[str], excluded: set[str]) -> set[str]:
    """Drop excluded domains and their subdomains from the block list."""
    return {d for d in domains if not covered_by(d, excluded)}


def dump_lines(path: str, sources: list[str], lines: list[str], what: str) -> None:
    """Write a snapshot (one entry per line) with a provenance header. A .gz
    path is gzipped byte-reproducibly (mtime=0, no embedded filename)."""
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    resolved = [POPULAR_UPSTREAM_LISTS.get(s.lower(), s) for s in sources]
    with contextlib.ExitStack() as stack:
        if path.endswith(".gz"):
            raw = stack.enter_context(open(path, "wb"))
            gz = stack.enter_context(gzip.GzipFile(fileobj=raw, mode="wb", mtime=0, filename=""))
            f = stack.enter_context(io.TextIOWrapper(gz, encoding="utf-8"))
        else:
            f = stack.enter_context(open(path, "w", encoding="utf-8"))
        f.write("# Generated by scripts/build_rules.py / build_cosmetics.py. Do not edit by hand.\n")
        for src in resolved:
            f.write(f"# Source: {src}\n")
        f.write(f"# Entries: {len(lines)} {what}\n")
        for line in lines:
            f.write(line + "\n")
    print(f"Wrote {len(lines)} {what} to {path}")


def dump_domains(path: str, sources: list[str], domains: set[str], third_party: set[str] = frozenset()) -> None:
    """Domain snapshot: plain domains one per line, third-party-only domains as
    "||domain^$third-party"."""
    lines = sorted(domains) + [f"||{d}^$third-party" for d in sorted(third_party)]
    dump_lines(path, sources, lines, f"domains ({len(third_party)} third-party-only)")


def main():
    parser = argparse.ArgumentParser(description="Compile domain blocklists into Chrome DNR rulesets")
    parser.add_argument("--input", "-i", action="append",
                        help="Input file path, URL, or alias (" + ", ".join(POPULAR_UPSTREAM_LISTS) + ")")
    parser.add_argument("--exclude", "-x", action="append", default=[],
                        help="File of domains never to block (added as excludedRequestDomains)")
    parser.add_argument("--output-dir", "-o", default="rules", help="Output directory for JSON rulesets")
    parser.add_argument("--max-rules-per-file", "-m", type=int, default=DNR_MAX_RULES_PER_RULESET,
                        help=f"Max rules per file (default: {DNR_MAX_RULES_PER_RULESET})")
    parser.add_argument("--domains-per-rule", "-d", type=int, default=DEFAULT_DOMAINS_PER_RULE,
                        help=f"Domains grouped into one rule (default: {DEFAULT_DOMAINS_PER_RULE})")
    parser.add_argument("--prefix", "-p", default="blocklist", help="Filename prefix for generated rules")
    parser.add_argument("--dump-domains", metavar="PATH",
                        help="Write the cleaned domain list to PATH (a reproducible snapshot) instead of rules")
    args = parser.parse_args()

    if not 0 < args.max_rules_per_file <= DNR_MAX_RULES_PER_RULESET:
        parser.error(f"--max-rules-per-file must be between 1 and {DNR_MAX_RULES_PER_RULESET}")
    if args.domains_per_rule <= 0:
        parser.error("--domains-per-rule must be greater than 0")
    if not args.input:
        parser.error("at least one --input is required")

    try:
        all_domains, third_domains = read_rules(args.input)
        excluded = sorted(read_domains(args.exclude, strict=True)) if args.exclude else []
    except Exception as err:
        print(f"Failed to read sources: {err}", file=sys.stderr)
        sys.exit(1)

    if args.dump_domains:
        dump_domains(args.dump_domains, args.input, all_domains, third_domains)
        return

    # Excluded domains (and their subdomains) are also dropped from the list
    # itself; excludedRequestDomains then protects them from parent entries.
    all_domains = apply_exclusions(all_domains, set(excluded))
    domains = collapse_subdomains(all_domains)
    # Third-party-only entries already blocked outright are redundant.
    third_domains = {d for d in apply_exclusions(third_domains, set(excluded)) if not covered_by(d, all_domains)}
    third_list = collapse_subdomains(third_domains)
    print(f"\nTotal unique domains: {len(all_domains)} ({len(domains)} after collapsing covered subdomains)"
          f"; third-party-only: {len(third_list)}")

    rules = build_dnr_rules(domains, domains_per_rule=args.domains_per_rule, excluded=excluded)
    rules += build_dnr_rules(third_list, start_id=len(rules) + 1, domains_per_rule=args.domains_per_rule,
                             excluded=excluded, third_party_only=True)
    chunk_size = args.max_rules_per_file
    chunks = [rules[i:i + chunk_size] for i in range(0, len(rules), chunk_size)] or [[]]

    os.makedirs(args.output_dir, exist_ok=True)
    written = []
    for index, chunk in enumerate(chunks, start=1):
        filename = f"{args.prefix}_{index}.json" if len(chunks) > 1 else f"{args.prefix}.json"
        out_path = os.path.join(args.output_dir, filename)
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(chunk, f, indent=2)
            f.write("\n")
        written.append(out_path)
        print(f"Wrote {len(chunk)} rules to {out_path}")

    # New ruleset files are inert until declared in manifest.json.
    print("\nEnsure these entries exist in manifest.json -> declarative_net_request.rule_resources:")
    for path in written:
        ruleset_id = "ruleset_" + os.path.splitext(os.path.basename(path))[0]
        print(json.dumps({"id": ruleset_id, "enabled": True, "path": path.replace(os.sep, "/")}))


if __name__ == "__main__":
    main()
