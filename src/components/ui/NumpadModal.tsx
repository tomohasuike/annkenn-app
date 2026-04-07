import React, { useState, useEffect } from 'react';
import { X, Delete } from 'lucide-react';

interface NumpadModalProps {
  isOpen: boolean;
  initialValue: number;
  onConfirm: (value: number) => void;
  onClose: () => void;
  label?: string;
}

export const NumpadModal: React.FC<NumpadModalProps> = ({
  isOpen,
  initialValue,
  onConfirm,
  onClose,
  label
}) => {
  const [valueStr, setValueStr] = useState(initialValue.toString());

  // Reset value when opening for a new item
  useEffect(() => {
    if (isOpen) setValueStr(initialValue.toString());
  }, [isOpen, initialValue]);

  if (!isOpen) return null;

  const handlePress = (num: string) => {
    setValueStr(prev => prev === '0' ? num : prev + num);
  };

  const handleDelete = () => {
    setValueStr(prev => prev.length > 1 ? prev.slice(0, -1) : '0');
  };

  const handleClear = () => {
    setValueStr('0');
  };

  const handleSave = () => {
    const num = parseInt(valueStr, 10);
    onConfirm(isNaN(num) || num < 1 ? 1 : num);
    onClose();
  };

  const buttons = [
    ['7', '8', '9'],
    ['4', '5', '6'],
    ['1', '2', '3'],
    ['C', '0', 'DEL']
  ];

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[110] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div 
        className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl flex flex-col slide-in-from-bottom-full sm:slide-in-from-bottom-0 animation-in duration-200"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
          <div className="truncate pr-4 font-bold text-slate-600 text-sm">
            {label ? `${label} の数量` : '数量を入力'}
          </div>
          <button onClick={onClose} className="p-2 bg-slate-200 rounded-full text-slate-600 hover:bg-slate-300 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 pb-2 text-center">
          <div className="text-5xl font-black text-slate-800 tracking-wider mb-2">
            {valueStr}
          </div>
        </div>

        <div className="p-4 grid grid-cols-3 gap-3">
          {buttons.flat().map((btn, idx) => {
            if (btn === 'C') {
              return (
                <button key={idx} onClick={handleClear} className="h-16 text-xl font-black bg-red-50 text-red-600 rounded-2xl active:scale-95 transition-all">
                  C
                </button>
              );
            }
            if (btn === 'DEL') {
              return (
                <button key={idx} onClick={handleDelete} className="h-16 flex items-center justify-center text-xl font-black bg-slate-100 text-slate-700 rounded-2xl active:scale-95 transition-all">
                  <Delete className="w-6 h-6" />
                </button>
              );
            }
            return (
              <button 
                key={idx} 
                onClick={() => handlePress(btn)} 
                className="h-16 text-3xl font-black bg-slate-100 text-slate-800 rounded-2xl hover:bg-slate-200 active:bg-blue-100 active:text-blue-600 active:scale-95 transition-all"
              >
                {btn}
              </button>
            );
          })}
        </div>

        <div className="p-4 pt-0">
          <button 
            onClick={handleSave}
            className="w-full h-16 bg-blue-600 hover:bg-blue-700 text-white text-xl font-black rounded-2xl shadow-lg shadow-blue-600/30 active:scale-95 transition-all"
          >
            決定
          </button>
        </div>
      </div>
    </div>
  );
}
