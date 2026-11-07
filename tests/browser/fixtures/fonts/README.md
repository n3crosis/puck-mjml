# Typography test fonts

These tiny original fonts are generated for this repository's tests, not copied
from a typeface. Every non-space ASCII letter is a rectangle. They intentionally
have distinct advances so browser font selection can be measured independently
of installed system fonts or third-party network availability.

- `static-400.woff`: 400-unit advances, declared normal weight 400.
- `static-600.woff`: 500-unit advances, declared normal weight 600.
- `other-400.woff`: 800-unit advances, for a second isolated editor.
- `variable.woff`: a real `wght` variable font, 100–900; advances interpolate
  from 500 to 4500 units. At weights 420 and 450 it advances 2100 and 2250
  units, respectively. At the fixture’s 20px size these are exact integer pixel
  advances (42 and 45px), avoiding platform-specific glyph advance rounding.

All fonts use 1000 units per em, 800 ascent, 200 descent, and a 700-unit rectangle
height. They contain space and A–Z/a–z only and are licensed under this project's
MIT license. Generated using FontTools 4.61.1 FontBuilder and varLib.

Regenerate from the repository root with
`python scripts/generate-font-test-fixtures.py` in an environment with FontTools
4.61.1. The script constructs all outlines and variation masters, uses a fixed
1970-01-01 timestamp, and records SHA-256 hashes in `manifest.json`. It does not
download or read any existing typeface. `tests/font-fixtures.test.ts` checks the
binary hashes and verifies the variable font contains an `fvar` table.

The original 600–1000-unit variable fixture produced fractional advances at
20px. Chromium/FreeType rounded the 420-weight advance from 15.2 to 15px, so
seven glyphs measured 105px rather than the unhinted 106.4px. The current
rectangle fixture avoids that ambiguity while keeping exact intermediate
weights and strict canvas-versus-compiled comparisons. Template fonts are not
changed by this test asset.
