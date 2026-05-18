import type { HTMLAttributes, ReactNode } from 'react';
import { ImageDithering } from '@paper-design/shaders-react';
import { cn } from '@/lib/utils';

type DivProps = HTMLAttributes<HTMLDivElement>;

export function HeroDitheringRoot({ className, ...props }: DivProps) {
  return (
    <section
      className={cn(
        'relative isolate overflow-hidden rounded-[36px] border border-[#183324]/12 bg-[linear-gradient(135deg,#fbf7eb_0%,#f4eedc_48%,#e8f0de_100%)] shadow-[0_40px_120px_rgba(9,27,18,0.16)]',
        'before:pointer-events-none before:absolute before:inset-0 before:bg-[linear-gradient(rgba(16,38,29,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(16,38,29,0.035)_1px,transparent_1px)] before:bg-[size:28px_28px] before:opacity-70',
        'after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:h-40 after:bg-[linear-gradient(180deg,rgba(251,247,235,0)_0%,rgba(16,26,18,0.08)_100%)]',
        className
      )}
      {...props}
    />
  );
}

export function HeroDitheringContainer({ className, ...props }: DivProps) {
  return (
    <div
      className={cn(
        'relative z-10 grid gap-8 px-5 py-6 sm:px-8 sm:py-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)] lg:gap-10 lg:px-10 lg:py-10',
        className
      )}
      {...props}
    />
  );
}

export function HeroDitheringContent({ className, ...props }: DivProps) {
  return <div className={cn('flex min-w-0 flex-col justify-center', className)} {...props} />;
}

interface HeroDitheringHeadingProps extends DivProps {
  eyebrow?: ReactNode;
  heading: ReactNode;
  description?: ReactNode;
}

export function HeroDitheringHeading({
  eyebrow,
  heading,
  description,
  className,
  ...props
}: HeroDitheringHeadingProps) {
  return (
    <div className={cn('space-y-4', className)} {...props}>
      {eyebrow ? (
        <div className="inline-flex w-fit items-center rounded-full border border-[#183324]/14 bg-white/55 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-[#375540] shadow-[0_8px_18px_rgba(16,38,29,0.06)]">
          {eyebrow}
        </div>
      ) : null}
      <div className="space-y-4">
        <div className="max-w-[11ch] text-balance font-sans text-[clamp(3.2rem,8vw,5.8rem)] font-black leading-[0.9] tracking-[-0.08em] text-[#10261d]">
          {heading}
        </div>
        {description ? (
          <div className="max-w-2xl text-pretty font-sans text-sm leading-7 text-[rgba(16,38,29,0.72)] sm:text-base">
            {description}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function HeroDitheringDescription({ className, ...props }: DivProps) {
  return <div className={cn('mt-6', className)} {...props} />;
}

export function HeroDitheringActions({ className, ...props }: DivProps) {
  return <div className={cn('mt-8', className)} {...props} />;
}

export function HeroDitheringBadges({ className, ...props }: DivProps) {
  return <div className={cn('mt-5 flex flex-wrap items-center gap-2', className)} {...props} />;
}

interface HeroDitheringVisualProps extends DivProps {
  imageSrc?: string;
  speed?: number;
}

export function HeroDitheringVisual({
  className,
  imageSrc = '/hayashi-logo.png',
  speed = 0,
  ...props
}: HeroDitheringVisualProps) {
  return (
    <div className={cn('relative hidden min-h-[420px] items-center justify-center lg:flex', className)} {...props}>
      <div className="pointer-events-none absolute inset-8 rounded-[36px] bg-[radial-gradient(circle_at_center,rgba(106,155,61,0.16),transparent_56%)] blur-2xl" />
      <div className="pointer-events-none absolute right-8 top-8 h-24 w-24 rounded-full border border-[#183324]/10 bg-white/35 backdrop-blur-sm" />
      <div className="pointer-events-none absolute bottom-10 left-8 h-16 w-16 rounded-full border border-[#d48c2e]/20 bg-[#f8f2e5]/80 shadow-[0_12px_24px_rgba(212,140,46,0.08)]" />

      <div className="relative aspect-[0.8] w-full max-w-[430px] overflow-hidden rounded-[999px] border border-[#183324]/14 bg-[linear-gradient(180deg,rgba(253,249,240,0.94)_0%,rgba(232,240,222,0.92)_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_24px_60px_rgba(16,38,29,0.14)]">
        <div className="absolute inset-[6%] rounded-[999px] border border-[#183324]/10 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.9),rgba(248,242,229,0.52)_62%,rgba(106,155,61,0.14)_100%)]" />
        <div className="absolute inset-[11%] overflow-hidden rounded-[999px] border border-[#183324]/12 bg-[#eef2df]">
          <ImageDithering
            image={imageSrc}
            colorFront="#6f9e42"
            colorBack="#07160f"
          colorHighlight="#fff5d8"
          type="8x8"
          size={2}
          colorSteps={4}
          originalColors
          speed={speed}
          fit="cover"
          scale={0.82}
          className="absolute inset-0 h-full w-full"
          />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0)_35%,rgba(7,22,15,0.12)_100%)]" />
        </div>
        <div className="pointer-events-none absolute inset-x-[17%] bottom-[11%] top-[73%] rounded-full border border-[#183324]/10 bg-white/35 blur-[2px]" />
      </div>
    </div>
  );
}

export function HeroDitheringMobileVisual({
  className,
  imageSrc = '/hayashi-logo.png',
  speed = 0,
  ...props
}: HeroDitheringVisualProps) {
  return (
    <div className={cn('relative z-10 px-5 pb-5 pt-0 lg:hidden', className)} {...props}>
      <div className="relative mx-auto aspect-[1.05] w-full max-w-[320px] overflow-hidden rounded-[28px] border border-[#183324]/12 bg-[linear-gradient(180deg,rgba(253,249,240,0.96)_0%,rgba(232,240,222,0.92)_100%)] shadow-[0_18px_40px_rgba(16,38,29,0.12)]">
        <ImageDithering
          image={imageSrc}
          colorFront="#6f9e42"
          colorBack="#07160f"
          colorHighlight="#fff5d8"
          type="8x8"
          size={2}
          colorSteps={4}
          originalColors
          speed={speed}
          fit="contain"
          scale={0.74}
          className="absolute inset-0 h-full w-full"
        />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0)_22%,rgba(7,22,15,0.12)_100%)]" />
      </div>
    </div>
  );
}
