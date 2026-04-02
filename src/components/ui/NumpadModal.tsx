import React, { useState, useEffect } from 'react';
import { X, Delete } from 'lucide-react';

interface NumpadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (value: number) => void;
  initialValue: number;
  label: string;
}

export const NumpadModal: React.FC<NumpadModalProps> = ({ isOpen, onClose, onConfirm, initialValue, label }) => {
  const [valueStr, setValueStr] = useState<string>(initialValue.toString());

  useEffect(() => {
    if (isOpen) {
      // 起動時に初期値をセット (最初は全選択状態のように上書きしやすくするため空にするか選べるが、そのまま出す)
      setValueStr(initialValue.toString());
    }
  }, [isOpen, initialValue]);

  if (!isOpen) return null;

  const handleKeyPress = (key: string) => {
    if (key === 'C') {
      setValueStr('');
      return;
    }
    
    if (key === 'BS') {
      setValueStr(prev => prev.slice(0, -1));
      return;
    }
    
    // 小数点の重複防止
    if (key === '.' && valueStr.includes('.')) {
      return;
    }
    
    // 入力が0のみの場合の上書き
    if (valueStr === '0' && key !== '.') {
      setValueStr(key);
      return;
    }
    
    setValueStr(prev => prev + key);
  };

  const handleConfirm = () => {
    const num = parseFloat(valueStr);
    onConfirm(isNaN(num) ? 0 : num);
    onClose();
  };

  const btnClass = "flex items-center justify-center p-3 bg-white/5 hover:bg-white/10 active:bg-white/20 border border-white/10 rounded-lg text-xl font-bold text-white transition-colors duration-100 ease-in-out select-none shadow-sm";
  const actionBtnClass = "flex items-center justify-center p-3 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 border border-white/10 rounded-lg text-base font-bold text-white transition-colors duration-100 ease-in-out select-none shadow-sm";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-0">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative bg-slate-900 border border-white/20 p-5 rounded-2xl shadow-2xl w-full max-w-[280px] animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-slate-300 font-bold text-xs tracking-widest">{label} を入力</h3>
          <button onClick={onClose} className="text-white/50 hover:text-white bg-white/5 hover:bg-white/10 p-1.5 rounded-full transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Display screen */}
        <div className="bg-slate-950 border border-white/10 rounded-xl p-3 mb-4 shadow-inner flex items-center justify-end overflow-hidden">
          <span className="text-3xl text-white font-mono tracking-wider font-bold truncate">
            {valueStr || '0'}
          </span>
        </div>

        {/* Keypad */}
        <div className="grid grid-cols-4 gap-2">
          {/* Row 1 */}
          <button onClick={() => handleKeyPress('7')} className={btnClass}>7</button>
          <button onClick={() => handleKeyPress('8')} className={btnClass}>8</button>
          <button onClick={() => handleKeyPress('9')} className={btnClass}>9</button>
          <button onClick={() => handleKeyPress('BS')} className={actionBtnClass}>
            <Delete className="w-5 h-5" />
          </button>

          {/* Row 2 */}
          <button onClick={() => handleKeyPress('4')} className={btnClass}>4</button>
          <button onClick={() => handleKeyPress('5')} className={btnClass}>5</button>
          <button onClick={() => handleKeyPress('6')} className={btnClass}>6</button>
          <button onClick={() => handleKeyPress('C')} className={`${actionBtnClass} text-red-400`}>C</button>

          {/* Row 3 */}
          <button onClick={() => handleKeyPress('1')} className={btnClass}>1</button>
          <button onClick={() => handleKeyPress('2')} className={btnClass}>2</button>
          <button onClick={() => handleKeyPress('3')} className={btnClass}>3</button>
          
          {/* Enter takes up 2 rows on the right */}
          <button 
            onClick={handleConfirm} 
            className="row-span-2 flex items-center justify-center p-3 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 shadow-[0_0_10px_rgba(37,99,235,0.4)] border-none rounded-lg text-lg font-bold text-white transition-colors duration-100 ease-in-out select-none"
          >
            OK
          </button>

          {/* Row 4 */}
          <button onClick={() => handleKeyPress('0')} className={`${btnClass} col-span-2`}>0</button>
          <button onClick={() => handleKeyPress('.')} className={btnClass}>.</button>
        </div>
        
      </div>
    </div>
  );
};
