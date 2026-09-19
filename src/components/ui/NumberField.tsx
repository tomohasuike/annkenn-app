import { useState } from 'react';

interface NumberFieldProps {
  value: number;
  onChange: (value: number) => void;
  /** 値の下限。空欄のままフォーカスを外した時にこの値へ戻す。既定0。 */
  min?: number;
  className?: string;
  inputMode?: 'numeric' | 'decimal';
}

/**
 * 数値入力用の<input type="number">ラッパー。
 *
 * 素の `<input type="number" value={n} onChange={e => setN(Number(e.target.value) || 0)}>`
 * は、バックスペースで全消去した瞬間に空文字列→Number("")===0 が即座に親へ反映され、
 * 表示が強制的に「0」に戻ってしまう（新しい数字を打とうとしても常に0から始まり打ちにくい）。
 * ここでは入力中の文字列を別に持ち、空欄の間は親のonChangeを呼ばない（＝親の数値は最後に
 * 確定した値のまま）ことで、消してから打ち直す操作を素直に受け付けるようにする
 * （2026-09-19、社長ご指摘「バックスペースでやると0になっちゃって入力しづらい」への対応）。
 */
export function NumberField({ value, onChange, min = 0, className, inputMode = 'numeric' }: NumberFieldProps) {
  const [text, setText] = useState(String(value));
  // 親側の値がリセット等で外部から変わったら表示も追従する（自分の入力中の変更とは別経路）。
  // useEffectではなくレンダー中に直接比較・更新する（Reactの「前回レンダーの値を保持する」
  // 定石。https://react.dev/reference/react/useState#storing-information-from-previous-renders）。
  const [lastSyncedValue, setLastSyncedValue] = useState(value);
  if (value !== lastSyncedValue) {
    setLastSyncedValue(value);
    if (Number(text) !== value) setText(String(value));
  }

  return (
    <input
      type="number"
      inputMode={inputMode}
      min={min}
      value={text}
      onChange={e => {
        const raw = e.target.value;
        setText(raw);
        if (raw === '') return;
        const n = Number(raw);
        if (!Number.isNaN(n)) onChange(Math.max(n, min));
      }}
      onBlur={() => {
        if (text === '' || Number.isNaN(Number(text))) {
          setText(String(min));
          onChange(min);
        }
      }}
      className={className}
    />
  );
}
