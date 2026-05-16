.PHONY: install install-hooks review review-fixture clean

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

clean:
	rm -f reports/*.json reports/*.md
