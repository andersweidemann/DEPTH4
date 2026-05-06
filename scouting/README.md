# Scouting

GitHub-mined idea cards for the Architect. One file per distilled idea.

## Card schema

See `idea_cards/` for live examples. Required frontmatter keys:

- `source_url`
- `commit`
- `license`
- `license_verdict` (`port_allowed` | `inspiration_only`)
- `stars`
- `last_commit`
- `language` (`MQL5-EA` | `MQL5-indicator` | `Python` | `Pine` | `other`)
- `symbols_targeted`
- `timeframes_targeted`
- `scout_verdict` (`promising` | `interesting` | `niche`)

## License policy

| SPDX | Verdict |
|---|---|
| MIT, BSD-2-Clause, BSD-3-Clause, Apache-2.0, Unlicense, 0BSD, ISC | `port_allowed` |
| MPL-2.0, LGPL, GPL-2.0, GPL-3.0, AGPL-3.0 | `inspiration_only` |
| none / "All rights reserved" | `inspiration_only` |
| Proprietary / paid / "personal use only" | `skip` |

Code from `port_allowed` repos that is literally reused must be attributed in
[ATTRIBUTIONS.md](ATTRIBUTIONS.md) with SPDX identifier and commit hash. Code from
any other verdict is used for ideas only; never copied.

## Denylist

[denylist.yaml](denylist.yaml) is a manually curated list of repos to skip
(scams, known bad actors, duplicates). The Scout checks this before emitting a
card.
