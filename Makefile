PYTHON ?= python3
BUILD := $(PYTHON) scripts/build_rules.py
EXCLUDE := -x scripts/exclude_domains.txt

.PHONY: rules update-lists test check assets package

# Rebuild the shipped static rulesets from local inputs only (deterministic;
# CI verifies rules/ matches). Upstream snapshots live in scripts/lists/.
rules:
	$(BUILD) -i scripts/sample_ads.txt -i scripts/lists/stevenblack.txt.gz $(EXCLUDE) -o rules -p ads
	$(BUILD) -i scripts/sample_trackers.txt -i scripts/sample_cname.txt -i scripts/lists/adguard_cname.txt.gz $(EXCLUDE) -o rules -p trackers

# Refresh upstream snapshots (network), then rebuild. Commit lists and rules.
update-lists:
	$(BUILD) -i stevenblack --dump-domains scripts/lists/stevenblack.txt.gz
	$(BUILD) -i cname_trackers --dump-domains scripts/lists/adguard_cname.txt.gz
	$(MAKE) rules

test:
	$(PYTHON) -m unittest discover -s tests -v

# Syntax-check extension JS and validate every JSON file.
check:
	for f in background.js popup/popup.js content/*.js; do node --check $$f || exit 1; done
	for f in manifest.json rules/*.json; do $(PYTHON) -m json.tool $$f > /dev/null || exit 1; done

# Regenerate icons and Web Store graphics (needs Google Chrome; set CHROME=... elsewhere).
assets:
	$(PYTHON) scripts/render_assets.py

# Web Store upload zip with only the files the extension loads at runtime.
VERSION := $(shell $(PYTHON) -c "import json; print(json.load(open('manifest.json'))['version'])")
package: check
	rm -rf dist && mkdir -p dist
	zip -qr dist/shieldblock-$(VERSION).zip manifest.json background.js LICENSE content icons popup rules -x '*.DS_Store'
	@echo "Built dist/shieldblock-$(VERSION).zip"
