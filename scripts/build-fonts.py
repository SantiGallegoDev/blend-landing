"""Genera las fuentes Newsreader optimizadas para Blend.

Parte de @fontsource-variable/newsreader (eje óptico + peso), fija el peso en 300,
conserva el eje óptico (opsz) para que los titulares grandes usen el corte de display,
y recorta los caracteres al español. Resultado: ~116 KB en lugar de ~279 KB.

Uso (desde la raíz del proyecto):  python -I scripts/build-fonts.py
Requiere: pip install fonttools brotli
"""
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools import subset

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'node_modules/@fontsource-variable/newsreader/files'
OUT = ROOT / 'src/assets/fonts'
UNICODES = 'U+0020-007E,U+00A0-00FF,U+0152-0153,U+2013-2014,U+2018-201A,U+201C-201E,U+2022,U+2026,U+20AC'

OUT.mkdir(parents=True, exist_ok=True)
for style in ('normal', 'italic'):
    font = TTFont(SRC / f'newsreader-latin-opsz-{style}.woff2')
    font = instancer.instantiateVariableFont(font, {'wght': 300})
    opts = subset.Options()
    opts.flavor = 'woff2'
    opts.layout_features = ['*']
    opts.name_IDs = ['*']
    opts.notdef_outline = True
    sub = subset.Subsetter(opts)
    sub.populate(unicodes=subset.parse_unicodes(UNICODES))
    sub.subset(font)
    font.flavor = 'woff2'
    target = OUT / f'newsreader-300-opsz-{style}.woff2'
    font.save(target)
    print(f'{target.relative_to(ROOT)}: {target.stat().st_size / 1024:.1f} KB')
