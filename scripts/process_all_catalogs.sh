#!/bin/bash
echo '=== Starting Mitsubishi Electric (三菱電機) ==='
python3 scripts/ingest_perfect_pdf.py /Users/hasuiketomoo/Downloads/ZFCT1A316.pdf '三菱電機' '施設照明カタログ'

echo '=== Starting Mirai Industry (未来工業) ==='
python3 scripts/ingest_perfect_pdf.py /Users/hasuiketomoo/Downloads/catalog_densetsu.pdf '未来工業' '電設資材総合カタログ'

echo '=== Starting Negurosu Denko (ネグロス電工) ==='
python3 scripts/ingest_perfect_pdf.py /Users/hasuiketomoo/Downloads/catalog_taflock.pdf 'ネグロス電工' 'タフロックス'

echo '=== Starting Naigai Denki (内外電機) ==='
python3 scripts/ingest_perfect_pdf.py /Users/hasuiketomoo/Downloads/カタログ/naigai0447_20240701.pdf '内外電機' '総合カタログ'

echo '=== Starting Nitto Kogyo (日東工業) ==='
python3 scripts/ingest_perfect_pdf.py /Users/hasuiketomoo/Downloads/カタログ/nitto-SK-25A.pdf '日東工業' '総合カタログ'

echo '=== Starting Furukawa Electric (古河電気工業) ==='
python3 scripts/ingest_perfect_pdf.py /Users/hasuiketomoo/Downloads/カタログ/kanro_zenbun-rurukawa.pdf '古河電気工業' 'プラフレキ'

echo '=== All Done ==='
