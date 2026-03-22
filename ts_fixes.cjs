const fs = require('fs');
let code = fs.readFileSync('src/pages/pdf-editor/PdfDrawingOverlay.tsx', 'utf-8');

// 1. Fix default export
code = code.replace("export const PdfDrawingOverlay: React.FC<PdfDrawingOverlayProps> = ({", "const PdfDrawingOverlay: React.FC<PdfDrawingOverlayProps> = ({");
if (!code.includes("export default PdfDrawingOverlay;")) {
    code += "\\nexport default PdfDrawingOverlay;\\n";
}

// 2. Add isNew to state
code = code.replace(
    "const [editingText, setEditingText] = useState<{ id: string, text: string, x: number, y: number, width: number, height: number, fontSize: number, fontFamily: string, color: string } | null>(null);",
    "const [editingText, setEditingText] = useState<{ id: string, text: string, x: number, y: number, width: number, height: number, fontSize: number, fontFamily: string, color: string, isNew?: boolean } | null>(null);"
);

// 3. Add finalizeTextEdit + isEditingRef
const finalizeCode = \`
  const isEditingRef = useRef<boolean>(false);

  const finalizeTextEdit = (id: string, newText: string) => {
    isEditingRef.current = true;
    setTimeout(() => {
        const newAnns = [...annotations];
        const idx = newAnns.findIndex(a => a.id === id);
        if (idx !== -1) {
            if (!newText.trim() && newAnns[idx].text === '') {
                newAnns.splice(idx, 1);
            } else {
                newAnns[idx] = { ...newAnns[idx], text: newText || ' ' };
            }
            setAnnotations(newAnns);
        }
        setEditingText(null);
        isEditingRef.current = false;
    }, 50);
  };
\`;
if (!code.includes("const finalizeTextEdit")) {
    code = code.replace(
        "const [hasScrolled, setHasScrolled] = useState(false);",
        "const [hasScrolled, setHasScrolled] = useState(false);\\n" + finalizeCode
    );
}

// 4. Fix setEditingText call in handleMouseDown
code = code.replace(
    "setEditingText({ id: newId, text: '', x: pos.x, y: pos.y, width: 200, height: 50, fontSize: 24, fontFamily: 'Helvetica', color: color });",
    "setEditingText({ id: newId, text: '', x: pos.x, y: pos.y, width: 200, height: 50, fontSize: 24, fontFamily: 'Helvetica', color: color, isNew: true });"
);

fs.writeFileSync('src/pages/pdf-editor/PdfDrawingOverlay.tsx', code, 'utf-8');
console.log("TS fixes applied successfully.");
