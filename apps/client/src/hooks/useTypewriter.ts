import { useState, useEffect, useRef } from 'react';

interface TypewriterOptions {
  text: string;
  speed?: number;
  startDelay?: number;
  enabled: boolean;
  onComplete?: () => void;
}

export function useTypewriter({ text, speed = 30, startDelay = 0, enabled, onComplete }: TypewriterOptions) {
  const [displayed, setDisplayed] = useState('');
  const [isDone, setIsDone] = useState(false);
  const indexRef = useRef(0);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) {
      setDisplayed('');
      setIsDone(false);
      indexRef.current = 0;
      if (timerRef.current) window.clearTimeout(timerRef.current);
      return;
    }

    if (startDelay > 0) {
      timerRef.current = window.setTimeout(() => {
        indexRef.current = 0;
        tick();
      }, startDelay);
    } else {
      indexRef.current = 0;
      tick();
    }

    function tick() {
      if (indexRef.current < text.length) {
        indexRef.current += 1;
        setDisplayed(text.slice(0, indexRef.current));
        // variable speed for "organic" feel
        const variance = Math.random() * 20 - 10;
        timerRef.current = window.setTimeout(tick, Math.max(10, speed + variance));
      } else {
        setIsDone(true);
        onComplete?.();
      }
    }

    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [text, speed, startDelay, enabled]);

  return { displayed, isDone };
}
