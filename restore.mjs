import fs from 'fs';

const rebuild = \`import React, { useState, useRef, useEffect } from 'react';
import { Stage, Layer, Rect, Text as KonvaText, Line, Transformer, Ellipse, Star, RegularPolygon, Arrow, Group, Shape, Circle } from 'react-konva';
import { v4 as uuidv4 } from 'uuid';
import Konva from 'konva';

export type ToolType = 'select' | 'pen' | 'text' | 'shape' | 'redact';
export type ShapeType = 'line' | 'arrow' | 'rect' | 'rounded_rect' | 'circle' | 'speech_bubble' | 'star' | 'polygon';

export interface Annotation {
  id: string;
  type: ToolType;
  shapeType?: ShapeType;
  x: number;
  y: number;
  width?: number;
  height?: number;
  color: string;
  fillColor?: string;
  strokeWidth?: number;
  points?: number[];
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  scaleX?: number;
  scaleY?: number;
  rotation?: number;
  tailTip?: { x: number, y: number };
  tailBase?: number;
  tailWidth?: number;
  cornerRadius?: number;
  innerRadius?: number;
  radius?: number;
}

interface PdfDrawingOverlayProps {
  pageIndex: number;
  dimensions: { width: number, height: number };
  annotations: Annotation[];
  setAnnotations: (anns: Annotation[]) => void;
  tool: ToolType;
  shapeType: ShapeType;
  color: string;
  fillColor: string;
  strokeWidth: number;
  onHistorySave: () => void;
  ScaleInfo: { scale: number };
}

export const PdfDrawingOverlay: React.FC<PdfDrawingOverlayProps> = ({
  pageIndex,
  dimensions,
  annotations,
  setAnnotations,
  tool,
  shapeType,
  color,
  fillColor,
  strokeWidth,
  onHistorySave,
  ScaleInfo,
}) => {
  const [isDrawing, setIsDrawing] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const [editingText, setEditingText] = useState<{ id: string, text: string, x: number, y: number, width: number, height: number, fontSize: number, fontFamily: string, color: string } | null>(null);
  const [hasScrolled, setHasScrolled] = useState(false);

  useEffect(() => {
    if (trRef.current && selectedId) {
      const stage = trRef.current.getStage();
      if (stage) {
        const selectedNode = stage.findOne('#' + selectedId);
        if (selectedNode) {
          trRef.current.nodes([selectedNode]);
          trRef.current.getLayer()?.batchDraw();
        }
      }
    }
  }, [selectedId, annotations]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId && !editingText) {
                if (e.target && ((e.target as HTMLElement).tagName.toLowerCase() === 'input' || (e.target as HTMLElement).tagName.toLowerCase() === 'textarea')) return;
                
                e.stopPropagation();
                e.preventDefault();
                onHistorySave();
                setAnnotations(annotations.filter(a => a.id !== selectedId));
                setSelectedId(null);
            }
        };
        window.addEventListener('keydown', handleKeyDown, true);
        return () => window.removeEventListener('keydown', handleKeyDown, true);
    }, [selectedId, annotations, setAnnotations, onHistorySave, editingText]);

  const handleDragEnd = (e: any, id: string) => {
    e.cancelBubble = true;
    const newAnns = [...annotations];
    const idx = newAnns.findIndex(a => a.id === id);
    if (idx !== -1) {
      newAnns[idx] = { ...newAnns[idx], x: e.target.x(), y: e.target.y() };
      setAnnotations(newAnns);
    }
  };

  const handleTransformEnd = (e: any, id: string) => {
    e.cancelBubble = true;
    const newAnns = [...annotations];
    const idx = newAnns.findIndex(a => a.id === id);
    if (idx !== -1) {
      const node = e.target;
      newAnns[idx] = {
        ...newAnns[idx],
         x: node.x(),
         y: node.y(),
         scaleX: node.scaleX(),
         scaleY: node.scaleY(),
         rotation: node.rotation(),
      };
      
      if (newAnns[idx].shapeType === 'line' || newAnns[idx].shapeType === 'arrow') {
          newAnns[idx].width = (newAnns[idx].width || 0) * node.scaleX();
          newAnns[idx].height = (newAnns[idx].height || 0) * node.scaleY();
          newAnns[idx].scaleX = 1;
          newAnns[idx].scaleY = 1;
          node.scaleX(1);
          node.scaleY(1);
      }
      setAnnotations(newAnns);
    }
  };

  const handleMouseDown = (e: any) => {
      const clickTarget = e.target;
      const stage = clickTarget.getStage();
      
      if (editingText) return; 

      if (tool === 'select') {
          if (clickTarget === stage) {
              setSelectedId(null);
          }
          return;
      }

      if (tool === 'text') {
          const pos = stage?.getPointerPosition();
          if (pos) {
              const newId = uuidv4();
              onHistorySave();
              setAnnotations([...annotations, {
                  id: newId,
                  type: 'text',
                  x: pos.x,
                  y: pos.y,
                  color: color,
                  text: '',
                  fontSize: 24,
                  fontFamily: 'Helvetica'
              }]);
              setEditingText({ id: newId, text: '', x: pos.x, y: pos.y, width: 200, height: 50, fontSize: 24, fontFamily: 'Helvetica', color: color });
          }
          return;
      }

      if (tool === 'pen' || tool === 'shape' || tool === 'redact') {
          isDrawing && setIsDrawing(false);
          onHistorySave();
          setIsDrawing(true);
          const pos = stage?.getPointerPosition();
          if (pos) {
              const newAnn: Annotation = {
                  id: uuidv4(),
                  type: tool,
                  shapeType: tool === 'shape' ? shapeType : undefined,
                  x: pos.x,
                  y: pos.y,
                  color: color,
                  fillColor: fillColor,
                  strokeWidth: strokeWidth,
              };

              if (tool === 'pen') {
                  newAnn.points = [0, 0];
              } else if (tool === 'shape' || tool === 'redact') {
                  newAnn.width = 0;
                  newAnn.height = 0;
              }

              setAnnotations([...annotations, newAnn]);
          }
      }
  };

  const handleMouseMove = (e: any) => {
      if (!isDrawing) return;
      const stage = e.target.getStage();
      const pos = stage?.getPointerPosition();
      if (!pos) return;

      const newAnns = [...annotations];
      const lastAnnotation = newAnns[newAnns.length - 1];
      
      if (lastAnnotation.type === 'pen') {
          lastAnnotation.points = lastAnnotation.points?.concat([pos.x - lastAnnotation.x, pos.y - lastAnnotation.y]);
      } else if (lastAnnotation.type === 'shape' || lastAnnotation.type === 'redact') {
          const dx = pos.x - lastAnnotation.x;
          const dy = pos.y - lastAnnotation.y;
          
          if (lastAnnotation.shapeType === 'line' || lastAnnotation.shapeType === 'arrow') {
              newAnns[newAnns.length - 1] = { ...lastAnnotation, width: dx, height: dy };
          } else if (lastAnnotation.shapeType === 'rect' || lastAnnotation.type === 'redact') {
              newAnns[newAnns.length - 1] = { ...lastAnnotation, width: dx, height: dy };
          } else if (lastAnnotation.shapeType === 'rounded_rect') {
              newAnns[newAnns.length - 1] = { ...lastAnnotation, width: dx, height: dy, cornerRadius: Math.max(0, Math.min(Math.abs(dx), Math.abs(dy)) / 4) };
          } else if (lastAnnotation.shapeType === 'circle') {
              newAnns[newAnns.length - 1] = { ...lastAnnotation, width: dx, height: dy };
          } else if (lastAnnotation.shapeType === 'star') {
              newAnns[newAnns.length - 1] = { ...lastAnnotation, width: dx, height: dy, innerRadius: Math.min(Math.abs(dx), Math.abs(dy)) / 4 };
          } else if (lastAnnotation.shapeType === 'polygon') {
              newAnns[newAnns.length - 1] = { ...lastAnnotation, width: dx, height: dy, radius: Math.min(Math.abs(dx), Math.abs(dy)) / 2 };
          } else if (lastAnnotation.shapeType === 'speech_bubble') {
              newAnns[newAnns.length - 1] = { 
                  ...lastAnnotation, 
                  width: dx, 
                  height: dy,
                  tailTip: { x: dx / 2, y: dy + Math.max(20, Math.abs(dy) * 0.3) },
                  tailBase: dx / 2,
                  tailWidth: Math.max(10, Math.abs(dx) * 0.2)
              };
          }
      }
      setAnnotations(newAnns);
  };

  const handleMouseUp = () => {
      if (!isDrawing) return;
      setIsDrawing(false);
  };

  return (
      <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: (tool === 'select' || tool === 'pen' || tool === 'text' || tool === 'shape' || tool === 'redact') ? 'auto' : 'none', zIndex: 10 }}>
          <Stage
              width={dimensions.width}
              height={dimensions.height}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onTouchStart={handleMouseDown}
              onTouchMove={handleMouseMove}
              onTouchEnd={handleMouseUp}
              onClick={(e) => {
                  const clickTarget = e.target;
                  const stage = clickTarget.getStage();
                  if (clickTarget === stage) {
                      setSelectedId(null);
                  }
              }}
              onTap={(e) => {
                  const clickTarget = e.target;
                  const stage = clickTarget.getStage();
                  if (clickTarget === stage) {
                      setSelectedId(null);
                  }
              }}
          >
              <Layer>
                  {annotations.map(ann => {
                      const draggable = tool === 'select' && selectedId === ann.id;
                      const w = ann.width || 0;
                      const h = ann.height || 0;
                      const sX = ann.scaleX || 1;
                      const sY = ann.scaleY || 1;
                      const rot = ann.rotation || 0;

                      let shapeComponent = null;

                      if (ann.type === 'pen') {
                          shapeComponent = <Line points={ann.points || []} stroke={ann.color} strokeWidth={ann.strokeWidth || 3} tension={0.5} lineCap="round" lineJoin="round" />;
                      } else if (ann.type === 'text') {
                          shapeComponent = <KonvaText text={ann.text || ''} fontSize={ann.fontSize || 24} fontFamily={ann.fontFamily || 'Helvetica'} fill={ann.color} width={w} height={h || undefined} wrap="word" padding={4} />;
                      } else if (ann.type === 'shape' || ann.type === 'redact') {
\`

const code = fs.readFileSync('src/pages/pdf-editor/PdfDrawingOverlay.tsx', 'utf-8');

// we find where the file current begins
// Currently the file begins exactly at line 1 with \`                if (ann.shapeType === 'line' || ann.shapeType === 'arrow') {\`

const newFileContent = rebuild + '\\n' + code;

fs.writeFileSync('src/pages/pdf-editor/PdfDrawingOverlay.tsx', newFileContent, 'utf-8');

console.log("Restored gracefully!");
