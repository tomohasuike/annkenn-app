import React from 'react';
import { Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight } from 'lucide-react';
import { ColorPickerDropdown } from './ColorPickerDropdown';

interface TextToolbarProps {
  fontFamily: string;
  setFontFamily: (font: string) => void;
  fontSize: number;
  setFontSize: (size: number) => void;
  fontStyle: string; // 'normal', 'italic', 'bold', 'italic bold'
  setFontStyle: (style: string) => void;
  textDecoration: string; // 'none', 'underline', 'line-through'
  setTextDecoration: (decoration: string) => void;
  textAlign: string; // 'left', 'center', 'right', 'justify'
  setTextAlign: (align: string) => void;
  textFill: string;
  setTextFill: (color: string) => void;
  fill: string;
  setFill: (color: string) => void;
  stroke: string;
  setStroke: (color: string) => void;
  strokeWidth: number;
  setStrokeWidth: (width: number) => void;
}

const TextToolbar: React.FC<TextToolbarProps> = ({
  fontFamily,
  setFontFamily,
  fontSize,
  setFontSize,
  fontStyle,
  setFontStyle,
  textDecoration,
  setTextDecoration,
  textAlign,
  setTextAlign,
  textFill,
  setTextFill,
  fill,
  setFill,
  stroke,
  setStroke,
  strokeWidth,
  setStrokeWidth,
}) => {
  const isBold = fontStyle.includes('bold');
  const isItalic = fontStyle.includes('italic');
  const isUnderline = textDecoration.includes('underline');

  const toggleBold = () => {
    if (isBold) {
      setFontStyle(fontStyle.replace('bold', '').trim() || 'normal');
    } else {
      setFontStyle(fontStyle === 'normal' ? 'bold' : `${fontStyle} bold`);
    }
  };

  const toggleItalic = () => {
    if (isItalic) {
      setFontStyle(fontStyle.replace('italic', '').trim() || 'normal');
    } else {
      setFontStyle(fontStyle === 'normal' ? 'italic' : `italic ${fontStyle}`);
    }
  };

  const toggleUnderline = () => {
    setTextDecoration(isUnderline ? 'none' : 'underline');
  };

  const fonts = ['Helvetica', 'Arial', 'Times New Roman', 'Courier', 'sans-serif', 'serif', 'monospace'];

  return (
    <div className="flex items-center gap-3 bg-white/80 backdrop-blur-md rounded-lg px-2 py-1 shadow-sm border border-gray-200 animate-in fade-in slide-in-from-right-2 duration-200">
      
      {/* Font Family */}
      <div className="flex items-center">
        <select 
          value={fontFamily} 
          onChange={(e) => setFontFamily(e.target.value)}
          className="bg-transparent text-gray-700 text-[12px] font-medium rounded outline-none cursor-pointer w-[110px] truncate hover:bg-gray-100 p-1 transition-colors"
        >
          {fonts.map(f => (
            <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>
          ))}
        </select>
      </div>

      <div className="w-px h-4 bg-gray-300 mx-0.5"></div>

      {/* Font Size */}
      <div className="flex items-center gap-1.5" title="フォントサイズ (pt)">
        <input 
          type="number" 
          value={fontSize} 
          onChange={(e) => setFontSize(Math.max(1, Number(e.target.value)))}
          className="w-[46px] bg-transparent text-gray-700 text-[12px] font-medium text-center border border-gray-200 rounded outline-none max-h-[22px] focus:border-blue-400 focus:bg-white transition-all appearance-none"
          style={{ MozAppearance: 'textfield' }}
        />
        <span className="text-[11px] text-gray-500 font-medium select-none">pt</span>
      </div>

      <div className="w-px h-4 bg-gray-300 mx-1"></div>

      {/* Styles: Bold, Italic, Underline */}
      <div className="flex items-center bg-gray-100/50 rounded p-0.5 border border-gray-200/50 shadow-inner">
        <button onClick={toggleBold} className={`p-1 rounded flex items-center justify-center transition-colors ${isBold ? 'bg-gray-300/70 text-gray-900 shadow-sm' : 'hover:bg-gray-200/60 text-gray-600'}`} title="太字 (B)"><Bold className="w-[14px] h-[14px]" strokeWidth={2.5} /></button>
        <button onClick={toggleItalic} className={`p-1 rounded flex items-center justify-center transition-colors ${isItalic ? 'bg-gray-300/70 text-gray-900 shadow-sm' : 'hover:bg-gray-200/60 text-gray-600'}`} title="斜体 (I)"><Italic className="w-[14px] h-[14px]" strokeWidth={2.5} /></button>
        <button onClick={toggleUnderline} className={`p-1 rounded flex items-center justify-center transition-colors ${isUnderline ? 'bg-gray-300/70 text-gray-900 shadow-sm' : 'hover:bg-gray-200/60 text-gray-600'}`} title="下線 (U)"><Underline className="w-[14px] h-[14px]" strokeWidth={2.5} /></button>
      </div>

      {/* Alignment */}
      <div className="flex items-center bg-gray-100/50 rounded p-0.5 border border-gray-200/50 shadow-inner">
        <button onClick={() => setTextAlign('left')} className={`p-1 rounded flex items-center justify-center transition-colors ${textAlign === 'left' ? 'bg-gray-300/70 text-gray-900 shadow-sm' : 'hover:bg-gray-200/60 text-gray-600'}`} title="左揃え"><AlignLeft className="w-[14px] h-[14px]" strokeWidth={2} /></button>
        <button onClick={() => setTextAlign('center')} className={`p-1 rounded flex items-center justify-center transition-colors ${textAlign === 'center' ? 'bg-gray-300/70 text-gray-900 shadow-sm' : 'hover:bg-gray-200/60 text-gray-600'}`} title="中央揃え"><AlignCenter className="w-[14px] h-[14px]" strokeWidth={2} /></button>
        <button onClick={() => setTextAlign('right')} className={`p-1 rounded flex items-center justify-center transition-colors ${textAlign === 'right' ? 'bg-gray-300/70 text-gray-900 shadow-sm' : 'hover:bg-gray-200/60 text-gray-600'}`} title="右揃え"><AlignRight className="w-[14px] h-[14px]" strokeWidth={2} /></button>
        {/* <button onClick={() => setTextAlign('justify')} className={`p-1 rounded flex items-center justify-center transition-colors ${textAlign === 'justify' ? 'bg-gray-300/70 text-gray-900 shadow-sm' : 'hover:bg-gray-200/60 text-gray-600'}`} title="均等揃え"><AlignJustify className="w-[14px] h-[14px]" strokeWidth={2} /></button> */}
      </div>

      <div className="w-px h-4 bg-gray-300 mx-0.5"></div>

      {/* Background Stroke Width */}
      <div className="flex items-center gap-1 scale-90 origin-center" title="枠線の太さ">
        <select value={strokeWidth} onChange={(e) => setStrokeWidth(Number(e.target.value))} className="bg-transparent border border-gray-200 text-gray-700 text-[11px] rounded outline-none p-0.5 relative z-10 cursor-pointer hover:bg-white transition-colors" style={{ MozAppearance: 'none', WebkitAppearance: 'none' }}>
            <option value={0}>ー (0px)</option>
            <option value={1}>1px</option>
            <option value={3}>3px</option>
            <option value={5}>5px</option>
            <option value={8}>8px</option>
            <option value={12}>12px</option>
        </select>
      </div>

      <div className="w-px h-4 bg-gray-300 mx-0.5"></div>

      {/* Background Stroke */}
      <div className="flex flex-col items-center gap-0.5" title="枠線の色">
        <span className="text-[10px] text-gray-500 font-bold leading-none pointer-events-none">枠</span>
        <div className="scale-90 origin-center">
            <ColorPickerDropdown color={stroke} onChange={setStroke} allowTransparent={true} type="stroke" align="right" />
        </div>
      </div>

      <div className="w-px h-6 bg-gray-300 mx-0.5"></div>

      {/* Background Fill */}
      <div className="flex flex-col items-center gap-0.5" title="背景色">
        <span className="text-[10px] text-gray-500 font-bold leading-none pointer-events-none">塗り</span>
        <div className="scale-90 origin-center">
            <ColorPickerDropdown color={fill} onChange={setFill} allowTransparent={true} type="fill" align="right" />
        </div>
      </div>

      <div className="w-px h-6 bg-gray-300 mx-0.5"></div>

      {/* Text Fill */}
      <div className="flex flex-col items-center gap-0.5" title="文字の色">
        <span className="text-[10px] text-gray-500 font-bold leading-none pointer-events-none">文字</span>
        <div className="scale-90 origin-center">
            <ColorPickerDropdown color={textFill} onChange={setTextFill} allowTransparent={false} type="fill" align="right" />
        </div>
      </div>

    </div>
  );
};

export default TextToolbar;
