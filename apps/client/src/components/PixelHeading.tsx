import { useState, useEffect, useRef } from 'react';

type PixelHeadingMode = 'uniform' | 'multi' | 'wave' | 'random';

interface PixelHeadingProps {
  as?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
  mode?: PixelHeadingMode;
  autoPlay?: boolean;
  cycleInterval?: number;
  staggerDelay?: number;
  className?: string;
  style?: React.CSSProperties;
  children: string;
}

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=[]{}|;:,.<>?';

function getRandomChar() {
  return CHARS[Math.floor(Math.random() * CHARS.length)];
}


export function PixelHeading({
  as: Component = 'h1',
  mode = 'wave',
  autoPlay = true,
  cycleInterval = 60,
  staggerDelay = 40,
  className = '',
  style,
  children,
}: PixelHeadingProps) {
  const text = children;
  const chars = text.split('');
  const [displayChars, setDisplayChars] = useState(() => chars.map(() => ' '));
  const [revealed, setRevealed] = useState(() => new Array(chars.length).fill(false));
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    // Reset state when text changes
    setDisplayChars(chars.map(() => ' '));
    setRevealed(new Array(chars.length).fill(false));

    if (!autoPlay) return;

    const resolved = new Array(chars.length).fill(false);
    let current = chars.map(() => getRandomChar());

    function revealNext() {
      const unrevealed = resolved.map((v, i) => (!v && chars[i] !== ' ') ? i : -1).filter(i => i !== -1);
      if (unrevealed.length === 0) {
        setDisplayChars([...chars]);
        setRevealed([...resolved]);
        return;
      }

      let toReveal: number[] = [];
      if (mode === 'uniform') {
        toReveal = unrevealed.slice(0, Math.max(1, Math.ceil(unrevealed.length * 0.15)));
      } else if (mode === 'wave') {
        const first = unrevealed[0];
        toReveal = unrevealed.filter(i => i <= first + 3);
      } else if (mode === 'random') {
        const pick = unrevealed[Math.floor(Math.random() * unrevealed.length)];
        toReveal = [pick];
      } else if (mode === 'multi') {
        toReveal = unrevealed.filter((_, idx) => idx % 3 === 0);
      }

      toReveal.forEach(i => {
        resolved[i] = true;
        current[i] = chars[i];
      });

      // Randomize unrevealed chars
      unrevealed.forEach(i => {
        if (!resolved[i]) {
          current[i] = getRandomChar();
        }
      });

      setDisplayChars([...current]);
      setRevealed([...resolved]);

      rafRef.current = setTimeout(revealNext, staggerDelay) as unknown as number;
    }

    rafRef.current = setTimeout(revealNext, 300) as unknown as number;

    // Cycle effect after initial reveal
    intervalRef.current = setInterval(() => {
      setDisplayChars(prev => {
        return prev.map((_c, i) => {
          if (chars[i] === ' ') return ' ';
          if (Math.random() > 0.85) {
            return getRandomChar();
          }
          return chars[i];
        });
      });
      // Restore after brief glitch
      setTimeout(() => {
        setDisplayChars([...chars]);
      }, 80);
    }, cycleInterval * 10);

    return () => {
      clearTimeout(rafRef.current);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [children, mode, autoPlay, cycleInterval, staggerDelay]);

  return (
    <Component
      className={className}
      style={{
        fontFamily: "'VT323', 'Courier New', monospace",
        letterSpacing: '0.08em',
        lineHeight: 1.1,
        ...style,
      }}
    >
      {displayChars.map((char, i) => (
        <span
          key={i}
          style={{
            display: 'inline-block',
            minWidth: '0.6em',
            color: revealed[i] ? undefined : 'rgba(255,140,97,0.4)',
            transition: revealed[i] ? 'color 0.15s ease' : undefined,
          }}
        >
          {char === ' ' ? ' ' : char}
        </span>
      ))}
    </Component>
  );
}
