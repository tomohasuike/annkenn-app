const fs = require('fs');
let content = fs.readFileSync('src/pages/pdf-editor/PdfEditor.tsx', 'utf8');

content = content.replace(
    /for \(\s*const ann of annotations\s*\)\s*\{\s*const x = ann\.x \* scaleX;\s*const y = pdfHeight - \(ann\.y \* scaleY\);\s*const baseHex = ann\.type === 'text' \? \(ann\.textFill \|\| '#000000'\) : \(ann\.color \|\| '#000000'\);\s*const color = hexToPdfRgb\(baseHex\);/s,
    `for (const ann of annotations) {
                try {
                const x = (ann.x || 0) * scaleX;
                const y = pdfHeight - ((ann.y || 0) * scaleY);
                const baseHex = ann.type === 'text' ? (ann.textFill || '#000000') : (ann.color || '#000000');
                const color = hexToPdfRgb(baseHex);`
);

content = content.replace(
    /pdfPage\.drawLine\(\{\s*start: \{ x: startX, y: startY \},\s*end: \{ x: endX, y: endY \},\s*thickness: strokeWidth,\s*color: color,\s*\}\);\s*\}\s*\}\s*\}\s*\}\s*return newPdfDoc;/s,
    `pdfPage.drawLine({
                            start: { x: startX, y: startY },
                            end: { x: endX, y: endY },
                            thickness: strokeWidth,
                            color: color,
                        });
                    }
                }
                } catch (annErr) {
                    console.error("図形の描画スキップ:", annErr, ann);
                    continue;
                }
            }
       }
       return newPdfDoc;`
);

fs.writeFileSync('src/pages/pdf-editor/PdfEditor.tsx', content);
console.log("Patch complete.");
