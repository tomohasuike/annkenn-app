import { useState, useCallback } from 'react';

export function useBoardHistory<T>() {
  const [history, setHistory] = useState<T[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);

  const initHistory = useCallback((initialState: T) => {
    setHistory([JSON.parse(JSON.stringify(initialState))]);
    setCurrentIndex(0);
  }, []);

  const pushHistory = useCallback((newState: T) => {
    setHistory((prev) => {
      const stateClone = JSON.parse(JSON.stringify(newState));
      const newHistory = prev.slice(0, currentIndex + 1);
      
      if (newHistory.length > 0 && JSON.stringify(newHistory[newHistory.length - 1]) === JSON.stringify(stateClone)) {
        return prev; // 無駄な（全く同じ）履歴の追加を防ぐ
      }
      return [...newHistory, stateClone];
    });
    setCurrentIndex((prev) => prev + 1);
  }, [currentIndex]);

  const undo = useCallback((): T | null => {
    if (currentIndex > 0) {
      const prevIndex = currentIndex - 1;
      setCurrentIndex(prevIndex);
      return JSON.parse(JSON.stringify(history[prevIndex]));
    }
    return null;
  }, [history, currentIndex]);

  const redo = useCallback((): T | null => {
    if (currentIndex < history.length - 1) {
      const nextIndex = currentIndex + 1;
      setCurrentIndex(nextIndex);
      return JSON.parse(JSON.stringify(history[nextIndex]));
    }
    return null;
  }, [history, currentIndex]);

  const clearHistory = useCallback(() => {
    setHistory([]);
    setCurrentIndex(-1);
  }, []);

  return {
    initHistory,
    pushHistory,
    undo,
    redo,
    clearHistory,
    canUndo: currentIndex > 0,
    canRedo: currentIndex < history.length - 1 && currentIndex !== -1,
  };
}
