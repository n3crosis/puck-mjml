"""Generate original rectangle fonts for browser tests. Requires FontTools 4.61.1.

No downloaded typeface or font data is used. WOFF uses Python's built-in zlib;
no Brotli or other runtime/build dependency is needed by puck-mjml.
"""

import hashlib
import json
from pathlib import Path
from tempfile import TemporaryDirectory

from fontTools.designspaceLib import AxisDescriptor, DesignSpaceDocument, SourceDescriptor
from fontTools.fontBuilder import FontBuilder
from fontTools.feaLib.builder import addOpenTypeFeaturesFromString
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.varLib import build
from fontTools.varLib.instancer import instantiateVariableFont

OUTPUT = Path(__file__).resolve().parents[1] / "tests/browser/fixtures/fonts"
CHARACTERS = " ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
ORDER = [".notdef"] + ["space" if c == " " else c for c in CHARACTERS]
TIMESTAMP = 2082844800  # 1970-01-01, in OpenType's seconds since 1904.


def fix_timestamp(font):
    font.recalcTimestamp = False
    font["head"].created = TIMESTAMP
    font["head"].modified = TIMESTAMP


def make_master(path, name, weight, advance, ligature=False):
    order = ORDER + (["f_f_i"] if ligature else [])
    builder = FontBuilder(1000, isTTF=True)
    builder.setupGlyphOrder(order)
    builder.setupCharacterMap({ord(c): "space" if c == " " else c for c in CHARACTERS})
    glyphs = {}
    for name_in_order in order:
        pen = TTGlyphPen(None)
        if name_in_order != "space":
            pen.moveTo((50, 0))
            pen.lineTo((advance - 50, 0))
            pen.lineTo((advance - 50, 700))
            pen.lineTo((50, 700))
            pen.closePath()
        glyphs[name_in_order] = pen.glyph()
    builder.setupGlyf(glyphs)
    builder.setupHorizontalMetrics({name: (advance, 0) for name in order})
    builder.setupHorizontalHeader(ascent=800, descent=-200)
    builder.setupNameTable({
        "familyName": name,
        "styleName": "Regular",
        "uniqueFontIdentifier": name,
        "fullName": name,
        "psName": name,
    })
    builder.setupOS2(
        sTypoAscender=800, sTypoDescender=-200,
        usWinAscent=800, usWinDescent=200, usWeightClass=weight,
    )
    builder.setupPost()
    builder.setupMaxp()
    if ligature:
        builder.font["hmtx"]["f_f_i"] = (1000, 0)
        addOpenTypeFeaturesFromString(builder.font,
            "feature liga { sub f f i by f_f_i; } liga;")
    fix_timestamp(builder.font)
    builder.save(path)
    return builder.font


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    with TemporaryDirectory(prefix="puck-mjml-font-fixtures-") as directory:
        work = Path(directory)
        for name, weight, width in [
            ("static-400", 400, 400),
            ("static-600", 600, 500),
            ("other-400", 400, 800),
        ]:
            font = make_master(work / f"{name}.ttf", name, weight, width)
            font.flavor = "woff"
            font.save(OUTPUT / f"{name}.woff")
        font = make_master(work / "ligature.ttf", "LigatureProbe", 400, 500, ligature=True)
        font.flavor = "woff"
        font.save(OUTPUT / "ligature.woff")
        designspace = DesignSpaceDocument()
        axis = AxisDescriptor()
        axis.name, axis.tag = "Weight", "wght"
        axis.minimum, axis.default, axis.maximum = 100, 100, 900
        designspace.addAxis(axis)
        for weight, width in [(100, 500), (900, 4500)]:
            path = work / f"master-{weight}.ttf"
            make_master(path, "VariableProbe", weight, width)
            source = SourceDescriptor()
            source.path, source.name = str(path), f"master{weight}"
            source.familyName, source.styleName = "VariableProbe", "Regular"
            source.location = {"Weight": weight}
            if weight == 100:
                source.copyInfo = source.copyLib = source.copyFeatures = True
            designspace.addSource(source)
        path = work / "probe.designspace"
        designspace.write(path)
        font, _, _ = build(path)
        fix_timestamp(font)
        font.flavor = "woff"
        font.save(OUTPUT / "variable.woff")
    variable_advances = {
        str(weight): instantiateVariableFont(font, {"wght": weight}, inplace=False)["hmtx"]["H"][0]
        for weight in (420, 450)
    }
    manifest = {
        "generator": "scripts/generate-font-test-fixtures.py",
        "fontToolsVersion": "4.61.1",
        "license": "MIT; original rectangle glyphs, no third-party font data",
        "variableAdvanceUnits": variable_advances,
        "files": {
            path.name: hashlib.sha256(path.read_bytes()).hexdigest()
            for path in sorted(OUTPUT.glob("*.woff"))
        },
    }
    (OUTPUT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")


if __name__ == "__main__":
    main()
