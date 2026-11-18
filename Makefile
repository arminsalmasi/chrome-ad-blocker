PYTHON ?= python3

.PHONY: rules test check

# Rebuild the shipped static rulesets from the seed lists in scripts/.
rules:
	$(PYTHON) scripts/build_rules.py -i scripts/sample_ads.txt -o rules -p ads
	$(PYTHON) scripts/build_rules.py -i scripts/sample_trackers.txt -i scripts/sample_cname.txt -o rules -p trackers

test:
	$(PYTHON) -m unittest discover -s tests -v

# Syntax-check extension JS and validate every JSON file.
check:
	for f in background.js popup/popup.js content/*.js; do node --check $$f || exit 1; done
	for f in manifest.json rules/*.json; do $(PYTHON) -m json.tool $$f > /dev/null || exit 1; done
