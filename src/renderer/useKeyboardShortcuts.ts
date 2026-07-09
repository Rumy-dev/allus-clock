import { useEffect } from 'react';

interface ShortcutOptions {
  onPlayPause?: () => void;
  onEscape?: () => void;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable;
}

export function useKeyboardShortcuts({ onPlayPause, onEscape }: ShortcutOptions): void {
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === 'Escape' && onEscape) {
        e.preventDefault();
        onEscape();
        return;
      }
      if (e.code === 'Space' && onPlayPause && !isTypingTarget(e.target)) {
        e.preventDefault();
        onPlayPause();
      }
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onPlayPause, onEscape]);
}
