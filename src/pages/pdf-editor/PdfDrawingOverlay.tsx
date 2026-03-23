import React, { useState, useRef, useEffect } from 'react';
import { Stage, Layer, Rect, RegularPolygon, Star, Arrow, Line, Transformer, Text as KonvaText, Group, Circle, Shape } from 'react-konva';
import { v4 as uuidv4 } from 'uuid';

export type ToolType = 'select' | 'pen' | 'text' | 'shape' | 'redact' | 'view' | 'text_select';
export type ShapeType = 'line' | 'arrow' | 'rect' | 'rounded_rect' | 'ellipse' | 'speech_bubble' | 'star' | 'polygon' | 'circle' | 'hexagon' | 'speech';

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
  fontStyle?: string;
  textDecoration?: string;
  align?: string;
  verticalAlign?: string;
  textFill?: string;
  textStroke?: string;
  textStrokeWidth?: number;
  fill?: string;
  stroke?: string;
  scaleX?: number;
  scaleY?: number;
  rotation?: number;
  tailTip?: { x: number, y: number };
  tailTipX?: number;
  tailTipY?: number;
  tailBaseX?: number;
  tailBase?: number;
  tailWidth?: number;
  cornerRadius?: number;
  innerRadius?: number;
  radius?: number;
}

interface PdfDrawingOverlayProps {
  pageIndex?: number;
  width: number;
  height: number;
  annotations: Annotation[];
  setAnnotations: React.Dispatch<React.SetStateAction<Annotation[]>>;
  tool: ToolType;
  shapeType: ShapeType;
  color: string;
  fillColor: string;
  strokeWidth: number;
  onHistorySave: () => void;
  ScaleInfo?: { scale: number };
  selectedIds: string[];
  setSelectedIds: (ids: string[]) => void;
  setActiveTool?: (tool: ToolType) => void;
  stageRef?: React.Ref<any>;
}

const PdfDrawingOverlay: React.FC<PdfDrawingOverlayProps> = ({
  width,
  height,
  annotations,
  setAnnotations,
  tool,
  shapeType,
  color,
  fillColor,
  strokeWidth,
  onHistorySave,
  selectedIds,
  setSelectedIds,
  setActiveTool,
  stageRef,
}) => {
  const isDrawingRef = useRef(false);
  const currentShapeIdRef = useRef<string | null>(null);
  const trRef = useRef<any>(null);
  const startPosRef = useRef<{x: number, y: number} | null>(null);

  // 【エラー防御壁】親コンポーネントがミスをしてundefinedを送ってきても、絶対にクラッシュさせない
  const safeAnnotations = Array.isArray(annotations) ? annotations : [];

  const [editingText, setEditingText] = useState<any | null>(null);
  const isEditingRef = useRef<boolean>(false);

  // Transformer（青い囲み枠）の制御
  useEffect(() => {
     if ((selectedIds || []).length > 0 && trRef.current) {
         const stage = trRef.current.getStage();
         if (stage) {
             const nodes = (selectedIds || []).map(id => {
                 const ann = safeAnnotations.find(a => a.id === id);
                 if (ann && ['line', 'arrow'].includes(ann.shapeType || '')) return null;

                 const arr = stage.find((el: any) => el.id() === id);
                 return arr && arr.length > 0 ? arr[0] : null;
             }).filter(Boolean);
             trRef.current.nodes(nodes as any);
             trRef.current.getLayer()?.batchDraw();
         }
     } else if (trRef.current) {
         trRef.current.nodes([]);
         trRef.current.getLayer()?.batchDraw();
     }
  }, [selectedIds, safeAnnotations]);

  // テキスト編集完了処理
  const finalizeTextEdit = (draftObj: any) => {
    if (!draftObj) return;
    isEditingRef.current = true;

    if (draftObj.isNew && draftObj.text.trim()) onHistorySave();
    else if (!draftObj.isNew) onHistorySave();

    setTimeout(() => {
        setAnnotations((prevAnns: any[]) => {
            const newAnns = Array.isArray(prevAnns) ? [...prevAnns] : [];
            const idx = newAnns.findIndex((a: any) => a.id === draftObj.id);
            if (idx !== -1) {
                if (!draftObj.text.trim()) newAnns.splice(idx, 1);
                else newAnns[idx] = { ...newAnns[idx], text: draftObj.text || ' ' };
            } else {
                if (draftObj.text.trim()) {
                    newAnns.push({
                        ...draftObj,
                        type: 'text'
                    });
                }
            }
            return newAnns;
        });
        setEditingText(null);
        isEditingRef.current = false;
    }, 50);
  };

  // 描画開始 (MouseDown)
  const handleMouseDown = (_e: any) => {
      if (editingText) return; 

      const clickTarget = _e.target;
      const stage = clickTarget.getStage();
      const pos = stage?.getPointerPosition();
      if (!pos) return;

      // 選択ツールの時、背景クリックで選択解除
      if (tool === 'select') {
          if (clickTarget === stage) setSelectedIds([]);
          return;
      }

      // 図形描画
      if (tool === 'shape') {
          isDrawingRef.current = true;
          startPosRef.current = pos;

          const newShape: Annotation = {
            id: Date.now().toString(),
            type: 'shape',
            shapeType: shapeType || 'rect', // パレットの選択状態
            x: pos.x,
            y: pos.y,
            width: 0,
            height: 0,
            fill: fillColor === 'transparent' ? 'transparent' : fillColor,
            stroke: color || '#ff0000',
            strokeWidth: strokeWidth || 3,
            color: color || '#ff0000',
          };
          setAnnotations((prev: any) => [...(Array.isArray(prev) ? prev : []), newShape]);
          return;
      }

      // フリーハンド＆墨消し
      if (tool === 'pen' || tool === 'redact') {
          isDrawingRef.current = true;
          startPosRef.current = pos;
          onHistorySave();

          const newAnn: Annotation = {
              id: uuidv4(),
              type: tool,
              x: pos.x,
              y: pos.y,
              color: color,
              fillColor: fillColor,
              strokeWidth: strokeWidth,
          };
          if (tool === 'pen') newAnn.points = [0, 0];
          else if (tool === 'redact') { newAnn.width = 0; newAnn.height = 0; }

          currentShapeIdRef.current = newAnn.id;
          setAnnotations((prevAnns: any) => [...(Array.isArray(prevAnns) ? prevAnns : []), newAnn]);
      }
  };

  // ドラッグ中 (MouseMove)
  const handleMouseMove = (_e: any) => {
      if (!isDrawingRef.current) return;
      const stage = _e.target.getStage();
      const pos = stage?.getPointerPosition();
      if (!pos || !startPosRef.current) return;

      if (tool === 'shape' || tool === 'redact') {
          const dx = pos.x - startPosRef.current.x;
          const dy = pos.y - startPosRef.current.y;

          setAnnotations((prev) => {
            const newAnns = Array.isArray(prev) ? [...prev] : [];
            if (newAnns.length === 0) return newAnns;
            const lastIndex = newAnns.length - 1;
            newAnns[lastIndex] = { ...newAnns[lastIndex], width: dx, height: dy };
            return newAnns;
          });
          return;
      }

      if (tool === 'pen') {
          setAnnotations((prevAnns: any) => {
              const newAnns = Array.isArray(prevAnns) ? [...prevAnns] : [];
              if (newAnns.length === 0) return newAnns;
              const lastAnn = newAnns[newAnns.length - 1];
              if (lastAnn.type === 'pen') {
                  const newPoints = (lastAnn.points || []).concat([pos.x - lastAnn.x, pos.y - lastAnn.y]);
                  newAnns[newAnns.length - 1] = { ...lastAnn, points: newPoints };
              }
              return newAnns;
          });
      }
  };

  // 描画終了 (MouseUp)
  const handleMouseUp = (_e: any) => {
      if (!isDrawingRef.current) return;
      isDrawingRef.current = false;

      let validShapeId: string | null = null;

      if (tool === 'shape' || tool === 'redact') {
          setAnnotations((prev) => {
            const newAnns = Array.isArray(prev) ? [...prev] : [];
            if (newAnns.length === 0) return newAnns;
            const lastShape = newAnns[newAnns.length - 1];

            // 5px未満のミスクリックはゴミとして捨てる
            if (Math.abs(lastShape.width || 0) < 5 && Math.abs(lastShape.height || 0) < 5) {
              newAnns.pop();
              return newAnns;
            }
            validShapeId = lastShape.id;
            return newAnns;
          });

          // Mac風UX: 描画後すぐに選択状態にする
          if (validShapeId) {
            onHistorySave();
            setTimeout(() => { 
              if (setActiveTool) setActiveTool('select');
              setSelectedIds([validShapeId!]);
            }, 10);
          }
      }

      if (tool === 'pen') {
          onHistorySave();
          setTimeout(() => {
              if (setActiveTool) setActiveTool('select');
          }, 10);
      }

      startPosRef.current = null;
      currentShapeIdRef.current = null;
  };

  return (
      <div style={{ 
          position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', 
          pointerEvents: (tool === 'view' || tool === 'text_select') ? 'none' : 'auto', 
          // グーとパー、十字、テキストのカーソルを完璧に出し分けます
          cursor: tool === 'view' ? 'grab' : (tool === 'text_select' ? 'text' : (tool === 'select' ? 'default' : (tool === 'text' ? 'text' : 'crosshair'))),
          zIndex: 50 
      }}>
          <Stage
              ref={stageRef}
              width={width}
              height={height}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onTouchStart={handleMouseDown}
              onTouchMove={handleMouseMove}
              onTouchEnd={handleMouseUp}
          >
              <Layer>
                  {safeAnnotations.map((ann) => {
                    const width = ann.width || 0;
                    const height = ann.height || 0;

                    // カーソル制御用のイベントハンドラ
                    const onMouseEnterGrab = (e: any) => {
                      if (tool !== 'select') return;
                      const stage = e.target.getStage();
                      if (stage) stage.container().style.cursor = 'grab';
                    };
                    const onMouseLeaveGrab = (e: any) => {
                      if (tool !== 'select') return;
                      const stage = e.target.getStage();
                      if (stage) stage.container().style.cursor = 'default';
                    };
                    const onMouseDownGrab = (e: any) => {
                      if (tool !== 'select') return;
                      const stage = e.target.getStage();
                      if (stage) stage.container().style.cursor = 'grabbing';
                    };
                    const onMouseUpGrab = (e: any) => {
                      if (tool !== 'select') return;
                      const stage = e.target.getStage();
                      if (stage) stage.container().style.cursor = 'grab';
                    };

                    // 全図形共通のプロパティ
                    const commonProps = {
                      id: ann.id,
                      x: ann.x,
                      y: ann.y,
                      scaleX: ann.scaleX !== undefined ? ann.scaleX : 1,
                      scaleY: ann.scaleY !== undefined ? ann.scaleY : 1,
                      rotation: ann.rotation || 0,
                      fill: ann.fillColor !== 'transparent' ? ann.fillColor : (ann.type === 'redact' ? ann.color : (ann.fill || 'transparent')),
                      stroke: ann.type === 'shape' ? ann.color : (ann.stroke || '#ff0000'),
                      strokeWidth: ann.type === 'shape' ? (ann.strokeWidth || 3) : (ann.strokeWidth || 0),
                      draggable: tool === 'select',
                      onMouseEnter: onMouseEnterGrab,
                      onMouseLeave: onMouseLeaveGrab,
                      onMouseDown: onMouseDownGrab,
                      onMouseUp: onMouseUpGrab,
                      onClick: (_e: any) => {
                        _e.cancelBubble = true;
                        if (tool === 'select') setSelectedIds([ann.id]);
                      },
                      onTap: (_e: any) => {
                        _e.cancelBubble = true;
                        if (tool === 'select') setSelectedIds([ann.id]);
                      },
                      onDragEnd: (_e: any) => {
                          if (tool === 'select') {
                              setAnnotations((prevAnns: any) => {
                                  const newAnns = Array.isArray(prevAnns) ? [...prevAnns] : [];
                                  const idx = newAnns.findIndex((a: any) => a.id === ann.id);
                                  if (idx !== -1) newAnns[idx] = { ...newAnns[idx], x: _e.target.x(), y: _e.target.y() };
                                  return newAnns;
                              });
                              onHistorySave();
                          }
                      },
                      onTransform: (_e: any) => {
                          if (tool === 'select' && ann.type === 'text') {
                              const node = _e.target;
                              // スケール変化を width に変換し、scale は 1 にリセットする
                              const newWidth = Math.max(node.width() * node.scaleX(), 20);
                              const newHeight = Math.max(node.height() * node.scaleY(), 20);
                              node.setAttrs({
                                  width: newWidth,
                                  height: newHeight,
                                  scaleX: 1,
                                  scaleY: 1,
                              });
                              if (node.getClassName() === 'Group') {
                                  node.getChildren().forEach((child: any) => child.setAttrs({ width: newWidth, height: newHeight }));
                              }
                          }
                      },
                      onTransformEnd: (_e: any) => {
                          if (tool === 'select') {
                              const node = _e.target;
                              setAnnotations((prev: any) => {
                                  const prevArr = Array.isArray(prev) ? prev : [];
                                  return prevArr.map((a: any) => {
                                      if (a.id === ann.id) {
                                          if (a.type === 'text') {
                                              return { 
                                                  ...a, 
                                                  x: node.x(), 
                                                  y: node.y(), 
                                                  width: node.width(), // 変更された幅を確実に保存
                                                  height: node.height(),
                                                  scaleX: 1, 
                                                  scaleY: 1, 
                                                  rotation: node.rotation() 
                                              };
                                          } else {
                                              // 図形の場合は既存のまま
                                              return { ...a, x: node.x(), y: node.y(), scaleX: Math.max(0.01, node.scaleX()), scaleY: Math.max(0.01, node.scaleY()), rotation: node.rotation() };
                                          }
                                      }
                                      return a;
                                  });
                              });
                              onHistorySave();
                          }
                      }
                    };
          
                    if (ann.type === 'text') {
                      return (
                        <Group key={ann.id} {...commonProps} width={ann.width || 100} height={ann.height || 50}>
                          {/* 背景と枠線を描画する四角形 (Groupからの相対座標) */}
                          <Rect
                            x={0}
                            y={0}
                            width={ann.width || 100}
                            height={ann.height || 50}
                            fill={ann.fill || ann.fillColor || 'transparent'}
                            stroke={ann.stroke || (ann.strokeWidth && ann.strokeWidth > 0 ? ann.color : 'transparent')}
                            strokeWidth={Number(ann.strokeWidth) || 0}
                          />
                          {/* 文字本体 (Groupからの相対座標) */}
                          <KonvaText
                            x={0}
                            y={0}
                            text={ann.text || 'テキスト'}
                            fontSize={ann.fontSize || 20}
                            fontFamily={ann.fontFamily || 'sans-serif'}
                            fill={ann.textFill || ann.color || '#000000'}
                            width={ann.width || 100}
                            height={ann.height || 50}
                            align={ann.align || 'left'}
                            verticalAlign={ann.verticalAlign || 'middle'}
                            fontStyle={ann.fontStyle || 'normal'}
                            textDecoration={ann.textDecoration || ''}
                            stroke={ann.textStroke || 'transparent'}
                            strokeWidth={ann.textStrokeWidth || 0}
                            opacity={editingText?.id === ann.id ? 0 : 1}
                            onDblClick={(_e: any) => {
                                _e.cancelBubble = true;
                                if (tool === 'select') setEditingText({ ...ann, isNew: false });
                            }}
                          />
                        </Group>
                      );
                    }
          
                    if (ann.type === 'shape') {
                      // 共通のプロパティ
                      const shapeProps = {
                        ...commonProps,
                        id: ann.id, // Explicitly pass id since key is no longer spread
                        x: ann.x,
                        y: ann.y,
                        fill: ann.fill || 'transparent',
                        stroke: ann.stroke || '#ef4444',
                        strokeWidth: ann.strokeWidth || 3,
                        draggable: tool === 'select',
                      };

                      // shapeType に応じて描画するコンポーネントを切り替え
                      switch (ann.shapeType) {
                        case 'rect':
                          return <Rect key={ann.id} {...shapeProps} width={ann.width || 150} height={ann.height || 100} />;
                        case 'circle':
                        case 'ellipse':
                          // 円の場合（半径を指定）
                          return <Circle key={ann.id} {...shapeProps} radius={Math.max(ann.width || 100, ann.height || 100) / 2} />;
                        case 'line':
                        case 'arrow': {
                          // 直線・矢印の場合（緑のポッチを使ったカスタムリサイズ）
                          const { fill, stroke, strokeWidth, ...groupProps } = shapeProps;
                          const pts = ann.points || [0, 0, ann.width || 100, ann.height || 100];
                          const isSelected = selectedIds?.includes(ann.id);

                          const handleGroupDragEnd = (e: any) => {
                              // Group全体のドラッグで呼ばれる。ポッチ等からのバブリングを無視
                              if (e.target !== e.currentTarget) return;

                              const dx = e.target.x() - (ann.x || 0);
                              const dy = e.target.y() - (ann.y || 0);

                              // 親のGroupのx,yを0に戻す（見た目の位置を維持しつつ座標系をリセット）
                              e.target.x(ann.x || 0);
                              e.target.y(ann.y || 0);

                              // 中身のpointsをdx, dy分だけずらして保存する
                              const newPoints = pts.map((p: number, i: number) => i % 2 === 0 ? p + dx : p + dy);

                              setAnnotations((prev: any) => {
                                  const p = Array.isArray(prev) ? prev : [];
                                  return p.map((a: any) => a.id === ann.id ? { ...a, points: newPoints } : a);
                              });
                              onHistorySave();
                          };

                          const handleAnchorDragMove = (e: any, indexX: number, indexY: number) => {
                              const pos = e.target.position(); // Groupに対する相対座標
                              const newPoints = [...pts];
                              newPoints[indexX] = pos.x;
                              newPoints[indexY] = pos.y;
                              setAnnotations((prev: any) => {
                                  const p = Array.isArray(prev) ? prev : [];
                                  return p.map((a: any) => a.id === ann.id ? { ...a, points: newPoints } : a);
                              });
                          };

                          return (
                            <Group key={ann.id} {...groupProps} onDragEnd={handleGroupDragEnd}>
                              {ann.shapeType === 'arrow' ? (
                                <Arrow points={pts} fill={fill} stroke={stroke} strokeWidth={strokeWidth} pointerLength={10} pointerWidth={10} tension={0.5} lineCap="round" lineJoin="round" />
                              ) : (
                                <Line points={pts} stroke={stroke} strokeWidth={strokeWidth} tension={0.5} lineCap="round" lineJoin="round" />
                              )}
                              {isSelected && (
                                <>
                                  <Circle 
                                      x={pts[0]} 
                                      y={pts[1]} 
                                      radius={6} 
                                      fill="#00ff00" 
                                      stroke="#ffffff" 
                                      strokeWidth={2} 
                                      draggable 
                                      hitStrokeWidth={10} 
                                      onMouseEnter={onMouseEnterGrab}
                                      onMouseLeave={onMouseLeaveGrab}
                                      onMouseDown={onMouseDownGrab}
                                      onMouseUp={onMouseUpGrab}
                                      onDragStart={(e) => { e.cancelBubble = true; }} 
                                      onDragMove={(e) => {
                                          e.cancelBubble = true;
                                          handleAnchorDragMove(e, 0, 1);
                                      }} 
                                      onDragEnd={(e) => {
                                          e.cancelBubble = true;
                                          onHistorySave();
                                      }}
                                  />
                                  <Circle 
                                      x={pts[2]} 
                                      y={pts[3]} 
                                      radius={6} 
                                      fill="#00ff00" 
                                      stroke="#ffffff" 
                                      strokeWidth={2} 
                                      draggable 
                                      hitStrokeWidth={10} 
                                      onMouseEnter={onMouseEnterGrab}
                                      onMouseLeave={onMouseLeaveGrab}
                                      onMouseDown={onMouseDownGrab}
                                      onMouseUp={onMouseUpGrab}
                                      onDragStart={(e) => { e.cancelBubble = true; }} 
                                      onDragMove={(e) => {
                                          e.cancelBubble = true;
                                          handleAnchorDragMove(e, 2, 3);
                                      }} 
                                      onDragEnd={(e) => {
                                          e.cancelBubble = true;
                                          onHistorySave();
                                      }}
                                  />
                                </>
                              )}
                            </Group>
                          );
                        }
                        case 'star':
                          // 星の場合
                          return <Star key={ann.id} {...shapeProps} numPoints={5} innerRadius={30} outerRadius={60} />;
                        case 'hexagon':
                        case 'polygon':
                          // 多角形（六角形）の場合
                          return <RegularPolygon key={ann.id} {...shapeProps} sides={6} radius={50} />;
                        case 'rounded_rect':
                          // 角丸四角形の場合
                          return <Rect key={ann.id} {...shapeProps} width={ann.width || 150} height={ann.height || 100} cornerRadius={Math.max(0, Math.min(ann.width || 150, ann.height || 100) / 4)} />;
                        case 'speech_bubble':
                        case 'speech': {
                          const w = ann.width || 150;
                          const h = ann.height || 100;
                          const tipX = ann.tailTipX !== undefined ? ann.tailTipX : -20;
                          const tipY = ann.tailTipY !== undefined ? ann.tailTipY : h + 20;
                          const tailBaseX = ann.tailBaseX !== undefined ? ann.tailBaseX : w / 2;

                          // ★ 修正箇所：イベントハンドラ（onClick等）を失わないように展開する
                          const { fill, stroke, strokeWidth, ...groupProps } = shapeProps;
                          const isSelected = selectedIds?.includes(ann.id);

                          return (
                            <Group
                              {...groupProps}
                              width={w}
                              height={h}
                              onDragEnd={(e) => {
                                // Group全体をドラッグした時の処理（緑ポッチドラッグ時は発火させない）
                                if (e.target.id() === ann.id) {
                                  const dx = e.target.x() - (ann.x || 0);
                                  const dy = e.target.y() - (ann.y || 0);
                                  setAnnotations((prev: any) => {
                                      const p = Array.isArray(prev) ? prev : [];
                                      return p.map((a: any) => 
                                          a.id === ann.id ? { ...a, x: (ann.x || 0) + dx, y: (ann.y || 0) + dy } : a
                                      );
                                  });
                                  onHistorySave();
                                }
                              }}
                            >
                              <Shape
                                fill={fill}
                                stroke={stroke}
                                strokeWidth={strokeWidth}
                                width={w}
                                height={h}
                                sceneFunc={(context, shape) => {
                                  const r = 10; // 角丸の半径
                                  
                                  // 角丸四角形の描画
                                  context.beginPath();
                                  context.moveTo(r, 0);
                                  context.lineTo(w - r, 0);
                                  context.quadraticCurveTo(w, 0, w, r);
                                  context.lineTo(w, h - r);
                                  context.quadraticCurveTo(w, h, w - r, h);

                                  // 【修正】根元の座標（tailBaseX）を基準にしっぽを描画
                                  const tailWidth = 20; // しっぽの太さ
                                  const tailRight = Math.min(w - r, tailBaseX + tailWidth / 2);
                                  const tailLeft = Math.max(r, tailBaseX - tailWidth / 2);
                                  
                                  context.lineTo(tailRight, h);
                                  context.lineTo(tipX, tipY); // 緑ポッチの座標へ
                                  context.lineTo(tailLeft, h);

                                  // 残りの角丸を閉じる
                                  context.lineTo(r, h);
                                  context.quadraticCurveTo(0, h, 0, h - r);
                                  context.lineTo(0, r);
                                  context.quadraticCurveTo(0, 0, r, 0);
                                  context.closePath();

                                  context.fillStrokeShape(shape);
                                }}
                              />

                              {/* しっぽの【先端】の緑ポッチ（既存） */}
                              {isSelected && (
                                <Circle
                                  x={tipX}
                                  y={tipY}
                                  radius={6}
                                  fill="#00ff00"
                                  stroke="#ffffff"
                                  strokeWidth={2}
                                  draggable
                                  hitStrokeWidth={10}
                                  onMouseEnter={onMouseEnterGrab}
                                  onMouseLeave={onMouseLeaveGrab}
                                  onMouseDown={onMouseDownGrab}
                                  onMouseUp={onMouseUpGrab}
                                  onDragStart={(e) => { e.cancelBubble = true; }} // 親のドラッグを防ぐ
                                  onDragMove={(e) => {
                                    e.cancelBubble = true;
                                    const newTipX = e.target.x();
                                    const newTipY = e.target.y();
                                    setAnnotations((prev: any) => {
                                        const p = Array.isArray(prev) ? prev : [];
                                        return p.map((a: any) => 
                                            a.id === ann.id ? { ...a, tailTipX: newTipX, tailTipY: newTipY } : a
                                        );
                                    });
                                  }}
                                  onDragEnd={(e) => {
                                      e.cancelBubble = true;
                                      onHistorySave();
                                  }}
                                />
                              )}

                              {/* 【追加】しっぽの【根元（内側）】をスライドさせる緑ポッチ */}
                              {isSelected && (
                                <Circle
                                  x={tailBaseX}
                                  y={h} // 下辺の上に配置
                                  radius={6}
                                  fill="#00ff00"
                                  stroke="#ffffff"
                                  strokeWidth={2}
                                  draggable
                                  hitStrokeWidth={10}
                                  onMouseEnter={onMouseEnterGrab}
                                  onMouseLeave={onMouseLeaveGrab}
                                  onMouseDown={onMouseDownGrab}
                                  onMouseUp={onMouseUpGrab}
                                  onDragStart={(e) => { e.cancelBubble = true; }}
                                  onDragMove={(e) => {
                                    e.cancelBubble = true;
                                    // ドラッグしたX座標を根元の位置として保存（角丸に被らないよう枠内に収める）
                                    const newBaseX = Math.max(10, Math.min(w - 10, e.target.x()));
                                    
                                    // Y軸はずれないように強制的に下辺に固定し、X軸の表示を補正
                                    e.target.y(h);
                                    e.target.x(newBaseX);

                                    setAnnotations((prev: any) => {
                                        const p = Array.isArray(prev) ? prev : [];
                                        return p.map((a: any) => 
                                            a.id === ann.id ? { ...a, tailBaseX: newBaseX } : a
                                        );
                                    });
                                  }}
                                  onDragEnd={(e) => {
                                      e.cancelBubble = true;
                                      onHistorySave();
                                  }}
                                />
                              )}
                            </Group>
                          );
                        }
                        default:
                          // フォールバック（未知の図形はとりあえず四角にする）
                          return <Rect key={ann.id} {...shapeProps} width={150} height={100} />;
                      }
                    }

                    if (ann.type === 'redact') {
                      return <Rect key={ann.id} {...commonProps} width={width} height={height} />;
                    }

                    if (ann.type === 'pen') {
                      return <Line key={ann.id} {...commonProps} points={ann.points || [0, 0, width, height]} tension={0.5} lineCap="round" lineJoin="round" />;
                    }
          
                    return null;
                  })}
          
          {(selectedIds?.length || 0) > 0 && (
              <Transformer 
                  ref={trRef} 
                  rotationSnaps={[0, 90, 180, 270]} 
                  rotationSnapTolerance={10} 
                  boundBoxFunc={(_, newBox) => newBox}
                  ignoreStroke={true}
              />
          )}
        </Layer>
      </Stage>

      {editingText && (
          <textarea
             className="text-input"
             value={editingText.text}
             onChange={(_e) => setEditingText({ ...editingText, text: _e.target.value })}
             onMouseDown={(_e) => _e.stopPropagation()}
             onClick={(_e) => _e.stopPropagation()}
             onTouchStart={(_e) => _e.stopPropagation()}
             onPointerDown={(_e) => _e.stopPropagation()}
             onBlur={() => {
                 if (isEditingRef.current) return;
                 finalizeTextEdit(editingText);
             }}
             onKeyDown={(_e) => {
                 _e.stopPropagation();
                 if (_e.key === 'Enter' && !_e.shiftKey) {
                     _e.preventDefault();
                     finalizeTextEdit(editingText);
                 }
                 if (_e.key === 'Escape') {
                     _e.preventDefault();
                     setEditingText(null);
                 }
             }}
             autoFocus
             style={{
                position: 'absolute',
                top: editingText.y,
                left: editingText.x,
                color: editingText.textFill || editingText.color || '#000000',
                fontFamily: editingText.fontFamily || 'inherit',
                fontSize: editingText.fontSize ? `${parseInt(String(editingText.fontSize), 10) || 20}px` : 'inherit',
                fontWeight: editingText.fontStyle?.includes('bold') ? 'bold' : 'normal',
                fontStyle: editingText.fontStyle?.includes('italic') ? 'italic' : 'normal',
                textDecoration: editingText.textDecoration || 'none',
                textAlign: (editingText.align as any) || 'left',
                lineHeight: 1,
                background: editingText.fill || 'transparent',
                // 【クラッシュ完全防止】安全な固定のボーダー値を使用し、幅も数値化を保証
                border: (Number(editingText.strokeWidth) > 0) ? `${Number(editingText.strokeWidth)}px solid ${editingText.stroke || editingText.color || 'black'}` : 'none',
                outline: 'none',
                resize: 'none',
                padding: '4px',
                margin: 0,
                overflow: 'hidden',
                whiteSpace: 'pre-wrap',
                zIndex: 9999,
                width: `${Math.max(20, Number(editingText.width) || 100)}px`,
                height: editingText.height ? `${editingText.height}px` : 'auto',
                minHeight: '30px'
             }}
          />
      )}
    </div>
  );
}

export default PdfDrawingOverlay;