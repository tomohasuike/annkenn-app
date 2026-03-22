const fs = require('fs');
let code = fs.readFileSync('src/pages/pdf-editor/PdfDrawingOverlay.tsx', 'utf-8');

const startStr = "                if (ann.shapeType === 'line') {";
const endStr = "                } else if (ann.shapeType === 'speech_bubble') {";

const startIndex = code.indexOf(startStr);
const endIndex = code.indexOf(endStr);

if (startIndex !== -1 && endIndex !== -1) {
    const replacement = \`                if (ann.shapeType === 'line' || ann.shapeType === 'arrow') {
                    const isArrow = ann.shapeType === 'arrow';
                    const shape = isArrow ? (
                        <Arrow points={[0, 0, w, h]} stroke={ann.color} fill={ann.color} strokeWidth={ann.strokeWidth || 3} pointerLength={10} pointerWidth={10} />
                    ) : (
                        <Line points={[0, 0, w, h]} stroke={ann.color} strokeWidth={ann.strokeWidth || 3} />
                    );
                    
                    shapeComponent = (
                        <>
                            {shape}
                            {selectedId === ann.id && (
                                <>
                                    <Circle x={0} y={0} radius={6} fill="#00ff00" stroke="#ffffff" strokeWidth={2} draggable
                                        onDragStart={(e: any) => { e.cancelBubble = true; onHistorySave(); }}
                                        onDragMove={(e: any) => {
                                            e.cancelBubble = true;
                                            const dx = e.target.x();
                                            const dy = e.target.y();
                                            e.target.x(0);
                                            e.target.y(0);
                                            const newAnns = [...annotations];
                                            const idx = newAnns.findIndex(a => a.id === ann.id);
                                            newAnns[idx] = { ...newAnns[idx], x: ann.x + dx, y: ann.y + dy, width: w - dx, height: h - dy };
                                            setAnnotations(newAnns);
                                        }}
                                        onDragEnd={(e: any) => { e.cancelBubble = true; }}
                                    />
                                    <Circle x={w} y={h} radius={6} fill="#00ff00" stroke="#ffffff" strokeWidth={2} draggable
                                        onDragStart={(e: any) => { e.cancelBubble = true; onHistorySave(); }}
                                        onDragMove={(e: any) => {
                                            e.cancelBubble = true;
                                            const newAnns = [...annotations];
                                            const idx = newAnns.findIndex(a => a.id === ann.id);
                                            newAnns[idx] = { ...newAnns[idx], width: e.target.x(), height: e.target.y() };
                                            setAnnotations(newAnns);
                                        }}
                                        onDragEnd={(e: any) => { e.cancelBubble = true; }}
                                    />
                                </>
                            )}
                        </>
                    );
                } else if (ann.shapeType === 'rect' || ann.type === 'redact') {
                    shapeComponent = <Rect width={w} height={h} stroke={ann.type === 'shape' ? ann.color : undefined} strokeWidth={ann.type === 'shape' ? (ann.strokeWidth || 3) : 0} fill={ann.type === 'redact' ? ann.color : (ann.fillColor !== 'transparent' ? ann.fillColor : undefined)} />;
                } else if (ann.shapeType === 'rounded_rect') {
                    const cRadius = ann.cornerRadius !== undefined ? ann.cornerRadius : Math.max(0, Math.min(Math.abs(w), Math.abs(h)) / 4);
                    const safeRadius = Math.max(0, Math.min(cRadius, Math.abs(w)/2, Math.abs(h)/2));
                    shapeComponent = (
                        <>
                            <Rect width={w} height={h} cornerRadius={safeRadius} stroke={ann.color} strokeWidth={ann.strokeWidth || 3} fill={ann.fillColor !== 'transparent' ? ann.fillColor : undefined} />
                            {selectedId === ann.id && (
                                <Circle 
                                    x={Math.abs(w) - safeRadius} y={safeRadius} radius={6} fill="#00ff00" stroke="#ffffff" strokeWidth={2} draggable
                                    onDragStart={(e: any) => { e.cancelBubble = true; onHistorySave(); }}
                                    onDragMove={(e: any) => {
                                        e.cancelBubble = true;
                                        const newRadius = Math.max(0, Math.min(e.target.y(), Math.abs(w)/2, Math.abs(h)/2));
                                        e.target.y(newRadius);
                                        e.target.x(Math.abs(w) - newRadius);
                                        const newAnns = [...annotations];
                                        const idx = newAnns.findIndex(a => a.id === ann.id);
                                        newAnns[idx] = { ...newAnns[idx], cornerRadius: newRadius };
                                        setAnnotations(newAnns);
                                    }}
                                    onDragEnd={(e: any) => { e.cancelBubble = true; }}
                                />
                            )}
                        </>
                    );
                } else if (ann.shapeType === 'circle') {
                    shapeComponent = <Ellipse radiusX={Math.abs(w)/2} radiusY={Math.abs(h)/2} x={w/2} y={h/2} stroke={ann.color} strokeWidth={ann.strokeWidth || 3} fill={ann.fillColor !== 'transparent' ? ann.fillColor : undefined} />;
                } else if (ann.shapeType === 'star') {
                    const outerR = Math.min(Math.abs(w), Math.abs(h)) / 2;
                    const innerR = ann.innerRadius !== undefined ? ann.innerRadius : outerR / 4;
                    
                    shapeComponent = (
                        <>
                            <Star numPoints={5} innerRadius={innerR} outerRadius={outerR} x={w/2} y={h/2} stroke={ann.color} strokeWidth={ann.strokeWidth || 3} fill={ann.fillColor !== 'transparent' ? ann.fillColor : undefined} />
                            {selectedId === ann.id && (() => {
                                const angle = Math.PI * 2 / 5; 
                                const valleyAngle = -Math.PI / 2 + angle / 2;
                                const vx = w/2 + innerR * Math.cos(valleyAngle);
                                const vy = h/2 + innerR * Math.sin(valleyAngle);
                                return (
                                <Circle 
                                    x={vx} y={vy} radius={6} fill="#00ff00" stroke="#ffffff" strokeWidth={2} draggable
                                    onDragStart={(e: any) => { e.cancelBubble = true; onHistorySave(); }}
                                    onDragMove={(e: any) => {
                                        e.cancelBubble = true;
                                        const dx = e.target.x() - w/2;
                                        const dy = e.target.y() - h/2;
                                        const dist = Math.max(0, Math.min(Math.sqrt(dx*dx + dy*dy), outerR)); 
                                        e.target.x(w/2 + dist * Math.cos(valleyAngle));
                                        e.target.y(h/2 + dist * Math.sin(valleyAngle));
                                        const newAnns = [...annotations];
                                        const idx = newAnns.findIndex(a => a.id === ann.id);
                                        newAnns[idx] = { ...newAnns[idx], innerRadius: dist };
                                        setAnnotations(newAnns);
                                    }}
                                    onDragEnd={(e: any) => { e.cancelBubble = true; }}
                                />
                                );
                            })()}
                        </>
                    );
                } else if (ann.shapeType === 'polygon') {
                    const polyRadius = ann.radius !== undefined ? ann.radius : Math.min(Math.abs(w), Math.abs(h)) / 2;
                    shapeComponent = (
                        <>
                            <RegularPolygon sides={6} radius={polyRadius} x={w/2} y={h/2} stroke={ann.color} strokeWidth={ann.strokeWidth || 3} fill={ann.fillColor !== 'transparent' ? ann.fillColor : undefined} />
                            {selectedId === ann.id && (
                                <Circle 
                                    x={w/2} y={h/2 - polyRadius} radius={6} fill="#00ff00" stroke="#ffffff" strokeWidth={2} draggable
                                    onDragStart={(e: any) => { e.cancelBubble = true; onHistorySave(); }}
                                    onDragMove={(e: any) => {
                                        e.cancelBubble = true;
                                        const newR = Math.max(0, h/2 - e.target.y());
                                        e.target.x(w/2);
                                        e.target.y(h/2 - newR);
                                        const newAnns = [...annotations];
                                        const idx = newAnns.findIndex(a => a.id === ann.id);
                                        newAnns[idx] = { ...newAnns[idx], radius: newR };
                                        setAnnotations(newAnns);
                                    }}
                                    onDragEnd={(e: any) => { e.cancelBubble = true; }}
                                />
                            )}
                        </>
                    );
\`;
    const newCode = code.substring(0, startIndex) + replacement + code.substring(endIndex);
    fs.writeFileSync('src/pages/pdf-editor/PdfDrawingOverlay.tsx', newCode, 'utf-8');
    console.log("Success! Slice replaced perfectly!");
} else {
    console.log("IndexOf failed!");
}
