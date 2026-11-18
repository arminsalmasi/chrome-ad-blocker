import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))

from build_rules import build_dnr_rules, clean_domain  # noqa: E402


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
    def test_ids_and_shape(self):
        rules = build_dnr_rules(["a.com", "b.com"], start_id=5)
        self.assertEqual([r["id"] for r in rules], [5, 6])
        self.assertEqual(rules[0]["condition"]["urlFilter"], "||a.com^")
        self.assertEqual(rules[0]["action"], {"type": "block"})


if __name__ == "__main__":
    unittest.main()
