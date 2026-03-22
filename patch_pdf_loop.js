const fs = require('fs');
let content = fs.readFileSync('src/pages/pdf-editor/PdfEditor.tsx', 'utf8');

const regex = /for\s*\(\s*const\s*ann\s*of\s*annotations\s*\)\s*\{\s*try\s*\{[\s\S]*?\}\s*catch\s*\(annErr\)\s*\{\s*console\.error\("図形の描画スキップ:", annErr, ann\);\s*continue;\s*\}\s*\}/s;

const newLoop = `for (const ann of annotations) {
                try {
                    const rawX = ann.x || 0;
                    const rawY = ann.y || 0;
                    const rawW = ann.width || 0;
                    const rawH = ann.height || 0;

                    const sx = ann.scaleX || 1;
                    const sy = ann.scaleY || 1;

                    // Absolute Konva box bounds
                    const x1 = rawX * scaleX;
                    const y1 = pdfHeight - (rawY * scaleY);
                    const x2 = (rawX + rawW * sx) * scaleX;
                    const y2 = pdfHeight - ((rawY + rawH * sy) * scaleY);

                    // Normalize to bottom-left standard bounds
                    const actX = Math.min(x1, x2);
                    const actY = Math.min(y1, y2);
                    const actW = Math.abs(x2 - x1);
                    const actH = Math.abs(y2 - y1);

                    const baseHex = ann.type === 'text' ? (ann.textFill || '#000000') : (ann.color || '#000000');
                    const color = hexToPdfRgb(baseHex);

                    if (ann.type === 'shape' || ann.type === 'redact') {
                        const strokeColor = ann.type === 'shape' ? color : undefined;
                        const fillColorStr = ann.type === 'redact' ? ann.color : ann.fillColor;
                        const fillColor = fillColorStr && fillColorStr !== 'transparent' ? hexToPdfRgb(fillColorStr) : undefined;
                        const strokeWidth = ann.type === 'shape' ? (ann.strokeWidth || 3) * scaleX : 0;

                        if (ann.shapeType === 'circle') {
                            pdfPage.drawEllipse({
                                x: actX + actW / 2,
                                y: actY + actH / 2,
                                xScale: actW / 2,
                                yScale: actH / 2,
                                borderColor: strokeColor,
                                borderWidth: strokeWidth,
                                color: fillColor,
                            });
                        } else if (ann.shapeType === 'line' || ann.shapeType === 'arrow') {
                            pdfPage.drawLine({
                                start: { x: x1, y: y1 },
                                end: { x: x2, y: y2 },
                                thickness: strokeWidth,
                                color: strokeColor || color,
                            });
                        } else if (ann.shapeType === 'rect' || ann.shapeType === undefined || ann.type === 'redact') {
                            pdfPage.drawRectangle({
                                x: actX,
                                y: actY,
                                width: actW,
                                height: actH,
                                borderColor: strokeColor,
                                borderWidth: strokeWidth,
                                color: fillColor,
                            });
                        } else {
                            // Svg shapes scaled
                            let pathData = '';
                            if (ann.shapeType === 'speech_bubble') {
                                const r = 10 * scaleX;
                                const baseLocal = ann.tailBase !== undefined ? ann.tailBase : Math.abs(ann.width || 0)/2;
                                const tWidthLocal = ann.tailWidth || Math.max(10, Math.abs(ann.width || 0) * 0.2);
                                const base = baseLocal * Math.abs(ann.scaleX || 1) * scaleX;
                                const tWidth = tWidthLocal * Math.abs(ann.scaleX || 1) * scaleX;
                                const tipLocal = ann.tailTip || { x: Math.abs(ann.width || 0)/2, y: Math.abs(ann.height || 0) + Math.max(20, Math.abs(ann.height || 0) * 0.3) };
                                const tipX = tipLocal.x * Math.abs(ann.scaleX || 1) * scaleX;
                                const tipY = tipLocal.y * Math.abs(ann.scaleY || 1) * scaleY;
                                
                                const rightBase = Math.min(actW - r, base + tWidth/2);
                                const leftBase = Math.max(r, base - tWidth/2);
                                pathData = \`M \${r} 0 L \${actW - r} 0 Q \${actW} 0 \${actW} \${r} L \${actW} \${actH - r} Q \${actW} \${actH} \${actW - r} \${actH} L \${rightBase} \${actH} L \${tipX} \${tipY} L \${leftBase} \${actH} L \${r} \${actH} Q 0 \${actH} 0 \${actH - r} L 0 \${r} Q 0 0 \${r} 0 Z\`;
                            } else if (ann.shapeType === 'rounded_rect') {
                                const cRadiusLocal = ann.cornerRadius !== undefined ? ann.cornerRadius : Math.max(0, Math.min(Math.abs(ann.width || 0), Math.abs(ann.height || 0)) / 4);
                                const r = Math.max(0, Math.min(cRadiusLocal * Math.abs(ann.scaleX || 1) * scaleX, actW/2, actH/2));
                                pathData = \`M \${r} 0 L \${actW - r} 0 A \${r} \${r} 0 0 1 \${actW} \${r} L \${actW} \${actH - r} A \${r} \${r} 0 0 1 \${actW - r} \${actH} L \${r} \${actH} A \${r} \${r} 0 0 1 0 \${actH - r} L 0 \${r} A \${r} \${r} 0 0 1 \${r} 0 Z\`;
                            } else if (ann.shapeType === 'star') {
                                const outerRLocal = Math.min(Math.abs(ann.width || 0), Math.abs(ann.height || 0)) / 2;
                                const innerRLocal = ann.innerRadius !== undefined ? ann.innerRadius : outerRLocal / 4;
                                const outerR = outerRLocal * Math.abs(ann.scaleX || 1) * scaleX;
                                const innerR = innerRLocal * Math.abs(ann.scaleX || 1) * scaleX;
                                const cx = actW / 2;
                                const cy = actH / 2;
                                const numPoints = 5;
                                for (let i = 0; i < numPoints * 2; i++) {
                                    const radius = i % 2 === 0 ? outerR : innerR;
                                    const angle = i * Math.PI / numPoints - Math.PI / 2;
                                    const px = cx + radius * Math.cos(angle);
                                    const py = cy + radius * Math.sin(angle);
                                    pathData += i === 0 ? \`M \${px} \${py} \` : \`L \${px} \${py} \`;
                                }
                                pathData += 'Z';
                            } else if (ann.shapeType === 'polygon') {
                                const polyRadiusLocal = ann.radius !== undefined ? ann.radius : Math.min(Math.abs(ann.width || 0), Math.abs(ann.height || 0)) / 2;
                                const pR = polyRadiusLocal * Math.abs(ann.scaleX || 1) * scaleX;
                                const cx = actW / 2;
                                const cy = actH / 2;
                                const sides = 6;
                                for (let i = 0; i < sides; i++) {
                                    const angle = i * 2 * Math.PI / sides - Math.PI / 2;
                                    const px = cx + pR * Math.cos(angle);
                                    const py = cy + pR * Math.sin(angle);
                                    pathData += i === 0 ? \`M \${px} \${py} \` : \`L \${px} \${py} \`;
                                }
                                pathData += 'Z';
                            }

                            if (pathData) {
                                pdfPage.drawSvgPath(pathData, {
                                    x: x1,
                                    y: y1,
                                    scale: 1,
                                    borderColor: strokeColor,
                                    borderWidth: strokeWidth,
                                    color: fillColor,
                                });
                            }
                        }
                    } else if (ann.type === 'text' && ann.text && customFont) {
                        const rawFontSize = ann.fontSize || 24;
                        // Transform scale correctly to visual space
                        const visualScale = (scaleY + scaleX) / 2;
                        const fontSize = rawFontSize * visualScale * (ann.scaleY || 1);
                        pdfPage.drawText(ann.text, {
                            x: x1,
                            y: y1 - fontSize,
                            font: customFont,
                            size: fontSize,
                            color: color,
                        });
                    } else if (ann.type === 'pen' && ann.points && ann.points.length >= 4) {
                        const strokeWidth = (ann.strokeWidth || 3) * scaleX;
                        // Build an SVG Path instead of disconnected lines for smooth curves!
                        let pathData = \`M \${x1 + ann.points[0] * scaleX} \${y1 - ann.points[1] * scaleY} \`;
                        for (let j = 2; j < ann.points.length - 1; j += 2) {
                            pathData += \`L \${x1 + ann.points[j] * scaleX} \${y1 - ann.points[j+1] * scaleY} \`;
                        }
                        pdfPage.drawSvgPath(pathData, {
                            borderColor: color,
                            borderWidth: strokeWidth,
                            x: 0,
                            y: 0,
                            scale: 1,
                        });
                    }
                } catch (annErr) {
                    console.error("図形の描画スキップ:", annErr, ann);
                    continue;
                }
            }`;

if (regex.test(content)) {
    content = content.replace(regex, newLoop);
    fs.writeFileSync('src/pages/pdf-editor/PdfEditor.tsx', content);
    console.log("Rewrite successful");
} else {
    console.error("Regex missed! Loop not replaced.");
    process.exit(1);
}
