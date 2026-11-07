# Typography test fonts

These tiny original fonts are generated for this repository's tests, not copied
from a typeface. Every non-space ASCII letter is a rectangle. They intentionally
have distinct advances so browser font selection can be measured independently
of installed system fonts or third-party network availability.

- `static-400.woff`: 400-unit advances, declared normal weight 400.
- `static-600.woff`: 500-unit advances, declared normal weight 600.
- `other-400.woff`: 800-unit advances, for a second isolated editor.
- `variable.woff`: a real `wght` variable font, 100–900; advances interpolate
  from 600 to 1000 units. It covers intermediate weights such as 420 and 450.

All fonts use 1000 units per em, 800 ascent, 200 descent, and a 700-unit rectangle
height. They contain space and A–Z/a–z only and are licensed under this project's
MIT license. Generated using FontTools 4.61.1 FontBuilder and varLib.

Regenerate from the repository root with
`python scripts/generate-font-test-fixtures.py` in an environment with FontTools
4.61.1. The script constructs all outlines and variation masters, uses a fixed
1970-01-01 timestamp, and records SHA-256 hashes in `manifest.json`. It does not
download or read any existing typeface. `tests/font-fixtures.test.ts` checks the
binary hashes and verifies the variable font contains an `fvar` table.
