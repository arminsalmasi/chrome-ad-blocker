PYTHON ?= python3
BUILD := $(PYTHON) scripts/build_rules.py
EXCLUDE := -x scripts/exclude_domains.txt
LISTS := scripts/lists

.PHONY: rules cosmetics update-lists test check site-test window-test assets package

# Rebuild the shipped rulesets and site cosmetics from local inputs only
# (deterministic; CI verifies the output matches). Upstream snapshots live in
# scripts/lists/ and are refreshed by `make update-lists`.
rules: cosmetics
	$(BUILD) -i scripts/sample_ads.txt -i $(LISTS)/stevenblack.txt.gz -i $(LISTS)/easylist_domains.txt.gz $(EXCLUDE) -o rules -p ads
	$(BUILD) -i scripts/sample_trackers.txt -i scripts/sample_cname.txt -i $(LISTS)/adguard_cname.txt.gz -i $(LISTS)/easyprivacy_domains.txt.gz $(EXCLUDE) -o rules -p trackers

cosmetics:
	$(PYTHON) scripts/build_cosmetics.py -i $(LISTS)/easylist_cosmetic.txt.gz -o content/cosmetic_sites

# Refresh upstream snapshots (network), then rebuild. Commit lists and outputs.
update-lists:
	$(BUILD) -i stevenblack --dump-domains $(LISTS)/stevenblack.txt.gz
	$(BUILD) -i cname_trackers --dump-domains $(LISTS)/adguard_cname.txt.gz
	$(BUILD) -i easylist --dump-domains $(LISTS)/easylist_domains.txt.gz
	$(BUILD) -i easyprivacy --dump-domains $(LISTS)/easyprivacy_domains.txt.gz
	$(PYTHON) scripts/build_cosmetics.py -i easylist --dump $(LISTS)/easylist_cosmetic.txt.gz
	$(MAKE) rules

test:
	$(PYTHON) -m unittest discover -s tests -v

# Syntax-check extension JS and validate every JSON file.
check:
	for f in background.js popup/*.js blocked/*.js content/*.js content/cosmetic_sites/*.js tests/site/*.js; do node --check $$f || exit 1; done
	for f in manifest.json rules/*.json content/cosmetic_sites/index.json tests/site/sites.json; do $(PYTHON) -m json.tool $$f > /dev/null || exit 1; done

# A/B test against real websites (network + Google Chrome; see tests/site/README.md).
site-test:
	cd tests/site && npm install --silent --no-audit --no-fund && node site_test.js $(SITES)

# End-to-end test of the "View blocked requests" window on a real site.
window-test:
	cd tests/site && npm install --silent --no-audit --no-fund && node blocked_window_test.js

# Regenerate icons and Web Store graphics (needs Google Chrome; set CHROME=... elsewhere).
assets:
	$(PYTHON) scripts/render_assets.py

# Web Store upload zip with only the files the extension loads at runtime.
VERSION := $(shell $(PYTHON) -c "import json; print(json.load(open('manifest.json'))['version'])")
package: check
	rm -rf dist && mkdir -p dist
	zip -qr dist/shieldblock-$(VERSION).zip manifest.json background.js LICENSE THIRD_PARTY_NOTICES.md blocked content icons popup rules -x '*.DS_Store'
	@echo "Built dist/shieldblock-$(VERSION).zip"
