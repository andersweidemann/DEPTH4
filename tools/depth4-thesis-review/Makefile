.PHONY: install install-hooks review review-fixture shadow-fixture shadow-summary clean

install:
	pip install -r requirements.txt

# Wire .githooks/pre-commit into your repo's hooks path.
install-hooks:
	@git config core.hooksPath .githooks
	@chmod +x .githooks/pre-commit
	@echo "Git hooks path set to .githooks. Pre-commit review is live."

review:
	python controller.py

review-fixture:
	python controller.py --fixture fixtures/sample_payload.json --fail-on never

shadow-fixture:
	python3 shadow_run.py --fixture fixtures/weak_link_payload.json --quiet

shadow-summary:
	python3 summarize_shadow.py --write-json

clean:
	rm -f reports/*.json reports/*.md
