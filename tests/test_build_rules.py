import os
import sys
import unittest
import unittest.mock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))

import gzip  # noqa: E402
import tempfile  # noqa: E402

from build_rules import (  # noqa: E402
    apply_exclusions, build_dnr_rules, clean_domain, collapse_subdomains, dump_domains, read_domains,
)


class CleanDomainAccepts(unittest.TestCase):
    def test_whole_domain_formats(self):
        cases = {
            "0.0.0.0 ads.example.com": "ads.example.com",
            "127.0.0.1 Tracker.Example.COM": "tracker.example.com",
            "ads.example.com": "ads.example.com",
            "ads.example.com.": "ads.example.com",
            "||ads.example.com^": "ads.example.com",
            "||ads.example.com^|": "ads.example.com",
            "||ads.example.com^$important": "ads.example.com",
            "||ads.example.com^$all": "ads.example.com",
            "0.0.0.0 ads.example.com # inline comment": "ads.example.com",
            "xn--80ak6aa92e.xn--p1ai": "xn--80ak6aa92e.xn--p1ai",
        }
        for line, expected in cases.items():
            with self.subTest(line=line):
                self.assertEqual(clean_domain(line), expected)


class CleanDomainRejects(unittest.TestCase):
    def test_rules_narrower_than_a_domain(self):
        # Each of these would become an over-broad site-wide block if accepted.
        for line in [
            "example.com##.ad-banner",
            "example.com#@#.ad-banner",
            "example.com#?#div:has(.ad)",
            "example.com#$#abort-on-property-read adblock",
            "example.com##+js(set-constant, canRunAds, true)",
            "example.com$$script[data-ad]",
            "||example.com/ads/banner.js",
            "||example.com^*/ads/",
            "||example.com^$script",
            "||example.com^$third-party",
            "||example.com^$3p",
            "||example.com^$important,3p",
            "||example.com^$popup",
            "||example.com^$doc",
            "||example.com^$document",
            "||example.com^$domain=news.site",
            "/banner\\d+\\.gif/",
            "@@||cdn.example.com^",
            "*.example.com",
            "||example.com:8080^",
        ]:
            with self.subTest(line=line):
                self.assertIsNone(clean_domain(line))

    def test_comments_and_noise(self):
        for line in ["", "   ", "# comment", "! comment", "[Adblock Plus 2.0]",
                     "0.0.0.0 localhost", "0.0.0.0 0.0.0.0", "localhost", "notadomain"]:
            with self.subTest(line=line):
                self.assertIsNone(clean_domain(line))


class BuildRules(unittest.TestCase):
    def test_groups_domains_into_rules(self):
        rules = build_dnr_rules(["a.com", "b.com", "c.com"], start_id=5, domains_per_rule=2)
        self.assertEqual([r["id"] for r in rules], [5, 6])
        self.assertEqual(rules[0]["condition"]["requestDomains"], ["a.com", "b.com"])
        self.assertEqual(rules[1]["condition"]["requestDomains"], ["c.com"])
        self.assertEqual(rules[0]["action"], {"type": "block"})
        self.assertNotIn("excludedRequestDomains", rules[0]["condition"])

    def test_excluded_domains_attached(self):
        rules = build_dnr_rules(["a.com"], excluded=["ok.a.com"])
        self.assertEqual(rules[0]["condition"]["excludedRequestDomains"], ["ok.a.com"])

    def test_empty_input_yields_no_rules(self):
        self.assertEqual(build_dnr_rules([]), [])


class CollapseSubdomains(unittest.TestCase):
    def test_drops_subdomains_covered_by_parent(self):
        self.assertEqual(
            collapse_subdomains({"x.com", "ads.x.com", "a.b.x.com", "y.co.uk", "ads.y.co.uk", "z.net"}),
            ["x.com", "y.co.uk", "z.net"],
        )

    def test_keeps_lookalike_domains(self):
        # "notx.com" is not a subdomain of "x.com".
        self.assertEqual(collapse_subdomains({"x.com", "notx.com"}), ["notx.com", "x.com"])



class Exclusions(unittest.TestCase):
    def test_removes_domain_and_subdomains_only(self):
        self.assertEqual(
            apply_exclusions({"ok.com", "cdn.ok.com", "notok.com", "ads.net"}, {"ok.com"}),
            {"notok.com", "ads.net"},
        )

    def test_invalid_exclusion_lines_warn(self):
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, "ex.txt")
            with open(path, "w") as f:
                f.write("# comment\nok.com\n*.bad.com\n")
            with unittest.mock.patch("sys.stderr") as err:
                self.assertEqual(read_domains([path], strict=True), {"ok.com"})
            self.assertIn("*.bad.com", "".join(c.args[0] for c in err.write.call_args_list))


class Snapshots(unittest.TestCase):
    def test_gzip_dump_is_deterministic_and_readable(self):
        with tempfile.TemporaryDirectory() as d:
            a, b = os.path.join(d, "a.txt.gz"), os.path.join(d, "b.txt.gz")
            dump_domains(a, ["src"], {"b.com", "a.com"})
            dump_domains(b, ["src"], {"a.com", "b.com"})
            with open(a, "rb") as fa, open(b, "rb") as fb:
                self.assertEqual(fa.read(), fb.read())
            with gzip.open(a, "rt") as f:
                self.assertEqual([l for l in f.read().splitlines() if not l.startswith("#")], ["a.com", "b.com"])
            self.assertEqual(read_domains([a]), {"a.com", "b.com"})


if __name__ == "__main__":
    unittest.main()
