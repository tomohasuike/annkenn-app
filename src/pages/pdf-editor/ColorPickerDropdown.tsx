import { useState, useRef, useEffect } from 'react';

interface ColorPickerDropdownProps {
  color: string;
  onChange: (color: string) => void;
  label?: string;
  allowTransparent?: boolean;
  type?: 'stroke' | 'fill';
  align?: 'left' | 'right';
}

const BASIC_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', 
  '#3b82f6', '#8b5cf6', '#d946ef', '#ffffff', '#9ca3af', '#000000'
];

const MATRIX_COLORS = [
  ['#fee2e2', '#ffedd5', '#fef9c3', '#dcfce7', '#cffafe', '#dbeafe', '#f3e8ff', '#fae8ff', '#f3f4f6'],
  ['#fca5a5', '#fdba74', '#fde047', '#86efac', '#67e8f9', '#93c5fd', '#d8b4fe', '#f0abfc', '#d1d5db'],
  ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#a855f7', '#d946ef', '#9ca3af'],
  ['#b91c1c', '#c2410c', '#a16207', '#15803d', '#0e7490', '#1d4ed8', '#7e22ce', '#a21caf', '#4b5563'],
  ['#7f1d1d', '#7c2d12', '#713f12', '#14532d', '#164e63', '#1e3a8a', '#581c87', '#701a75', '#1f2937']
];

export function ColorPickerDropdown({ color, onChange, label, allowTransparent, type = 'fill', align = 'left' }: ColorPickerDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleColorClick = (c: string) => {
    onChange(c);
    setIsOpen(false);
  };

  const isTransparent = color === 'transparent' || color === '' || color === null;

  return (
    <div className={`relative ${isOpen ? 'z-50' : 'z-10'}`} ref={containerRef}>
      <div className="flex items-center gap-1.5" title={label}>
        {label && <span className="text-[11px] font-medium text-gray-500 pointer-events-none">{label}</span>}
        <div 
          onClick={() => setIsOpen(!isOpen)}
          className={`flex flex-col items-center justify-center cursor-pointer border rounded shadow-sm bg-white overflow-hidden ${
             isOpen ? 'ring-2 ring-blue-500 border-blue-500' : 'border-gray-300 hover:border-gray-400'
          }`}
          style={{ width: '28px', height: '24px' }}
        >
          {isTransparent ? (
            <div className="w-full h-full relative overflow-hidden bg-white">
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-red-500 text-[20px] leading-none font-medium rotate-[-45deg] scale-125">/</div>
            </div>
          ) : type === 'stroke' ? (
            <div className="w-[18px] h-[18px] rounded-sm bg-white" style={{ border: `3px solid ${color}` }}></div>
          ) : (
            <div className="w-full h-full" style={{ backgroundColor: color }}></div>
          )}
        </div>
      </div>

      {isOpen && (
        <div className={`absolute top-full mt-2 ${align === 'right' ? 'right-0 origin-top-right' : 'left-0 origin-top-left'} p-3 bg-white border border-gray-200 shadow-xl rounded-xl z-50 w-[260px] cursor-default select-none animate-in fade-in zoom-in-95 duration-100`}>
          
          {/* Basic Colors Top Row */}
          <div className="flex items-center justify-between mb-3">
            {allowTransparent && (
              <button 
                onClick={() => handleColorClick('transparent')}
                className="w-5 h-5 rounded border border-gray-200 hover:ring-2 ring-gray-300 relative overflow-hidden bg-white shadow-sm flex-shrink-0"
                title="なし"
              >
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-red-500 text-[18px] leading-none font-medium rotate-[-45deg] scale-125">/</div>
              </button>
            )}
            {BASIC_COLORS.map(c => (
              <button 
                key={c} 
                className="w-5 h-5 rounded-sm border border-gray-200 hover:ring-2 ring-gray-400 hover:z-10 shadow-sm flex-shrink-0"
                style={{ backgroundColor: c }}
                onClick={() => handleColorClick(c)}
              />
            ))}
          </div>

          <div className="w-full h-px bg-gray-200 my-2"></div>

          {/* Color Matrix */}
          <div className="flex flex-col gap-0.5">
            {MATRIX_COLORS.map((row, i) => (
              <div key={i} className="flex justify-between">
                {row.map(c => (
                  <button 
                    key={c}
                    onClick={() => handleColorClick(c)}
                    className="w-[22px] h-[22px] border border-transparent rounded-[2px] transition-transform hover:scale-125 hover:ring-1 ring-black hover:z-20 hover:shadow-md"
                    style={{ backgroundColor: c }}
                    title={c}
                  />
                ))}
              </div>
            ))}
          </div>


        </div>
      )}
    </div>
  );
}
