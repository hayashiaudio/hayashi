import { cn } from '@/lib/utils';

type PixelFont = 'vt323' | 'mono';

const fontMap: Record<PixelFont, string> = {
  vt323: "'VT323', 'Courier New', monospace",
  mono: "'Courier New', monospace",
};

interface PixelParagraphProps {
  text: string;
  pixelWords?: string[];
  as?: 'p' | 'span' | 'div';
  font?: PixelFont;
  pixelWordClassName?: string;
  className?: string;
}

export function PixelParagraph({
  text,
  pixelWords = [],
  as: Component = 'p',
  font = 'vt323',
  pixelWordClassName,
  className,
}: PixelParagraphProps) {
  if (!pixelWords.length) {
    return (
      <Component
        className={className}
        style={{ fontFamily: fontMap[font], letterSpacing: '0.04em' }}
      >
        {text}
      </Component>
    );
  }

  const sortedWords = [...pixelWords].sort((a, b) => b.length - a.length);
  const escaped = sortedWords.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const regex = new RegExp(`(${escaped.join('|')})`, 'g');
  const segments = text.split(regex);

  return (
    <Component
      className={className}
      style={{ fontFamily: fontMap[font], letterSpacing: '0.04em' }}
    >
      {segments.map((segment, i) => {
        if (sortedWords.includes(segment)) {
          return (
            <span
              key={`${segment}-${i}`}
              className={cn(pixelWordClassName)}
              style={{
                fontFamily: fontMap[font],
                color: '#ff8c61',
                textShadow: '0 0 8px rgba(255,140,97,0.3)',
              }}
            >
              {segment}
            </span>
          );
        }
        return <span key={`${segment}-${i}`}>{segment}</span>;
      })}
    </Component>
  );
}
