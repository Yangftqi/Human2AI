import React from 'react';
import { PersonaCard } from '../core/types';

interface PersonaSkinBackdropProps {
  persona?: PersonaCard;
  variant?: 'immersive' | 'card' | 'popup';
  className?: string;
  children: React.ReactNode;
}

export const PersonaSkinBackdrop: React.FC<PersonaSkinBackdropProps> = ({
  persona,
  variant = 'immersive',
  className = '',
  children,
}) => {
  const primary = persona?.visual.primaryColor ?? '#38bdf8';
  const secondary = persona?.visual.secondaryColor ?? '#7dd3fc';
  const gradient =
    persona?.visual.gradientCss ??
    'linear-gradient(115deg, rgba(9,9,11,0.95) 0%, rgba(15,23,42,0.86) 100%)';
  const bgUrl = persona?.visual.bgImageDataUrl;
  const hasValidBg = Boolean(bgUrl && bgUrl.length > 40);
  const overlayOpacity = persona?.visual.bgOverlayOpacity ?? 0.62;

  if (variant === 'card') {
    return (
      <div
        className={`group relative overflow-hidden bg-zinc-950/78 backdrop-blur-xl ${className}`}
        style={
          {
            '--persona-primary': primary,
            '--persona-secondary': secondary,
            '--persona-gradient': gradient,
            boxShadow:
              'inset 0 1px 0 rgba(255,255,255,0.055), 0 20px 44px -22px rgba(0,0,0,0.8)',
          } as React.CSSProperties
        }
      >
        {hasValidBg && (
          <div
            className="pointer-events-none absolute inset-y-2 right-2 w-3/5 bg-contain bg-right bg-no-repeat opacity-32 transition-all duration-700 group-hover:scale-[1.02] group-hover:opacity-45"
            style={{
              backgroundImage: `url(${bgUrl})`,
              WebkitMaskImage:
                'linear-gradient(90deg, transparent 0%, rgba(0,0,0,0.85) 28%, #000 100%)',
              maskImage:
                'linear-gradient(90deg, transparent 0%, rgba(0,0,0,0.85) 28%, #000 100%)',
            }}
          />
        )}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'linear-gradient(100deg, rgba(9,9,11,0.95) 0%, rgba(9,9,11,0.86) 62%, rgba(9,9,11,0.68) 100%)',
          }}
        />
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-[1px]"
          style={{
            background: `linear-gradient(90deg, ${primary}75 0%, ${secondary}25 45%, transparent 100%)`,
          }}
        />
        <div className="relative z-10 flex h-full w-full flex-col">{children}</div>
      </div>
    );
  }

  return (
    <div
      className={`relative overflow-hidden ${className}`}
      style={
        {
          background: gradient,
          '--persona-primary': primary,
          '--persona-secondary': secondary,
          '--persona-gradient': gradient,
        } as React.CSSProperties
      }
    >
      {/* Full-body flat-vector character background anchored safely inside vertical bounds (never clipped by top/bottom borders) */}
      {hasValidBg && (
        <div
          className={`pointer-events-none absolute right-0 bg-contain bg-right bg-no-repeat transition-all duration-700 ease-out ${
            variant === 'popup'
              ? 'bottom-7 top-10 left-[22%]'
              : 'bottom-4 top-16 left-[20%] md:right-4'
          }`}
          style={{
            backgroundImage: `url(${bgUrl})`,
            WebkitMaskImage:
              'linear-gradient(90deg, transparent 0%, rgba(0,0,0,0.92) 24%, #000 100%)',
            maskImage:
              'linear-gradient(90deg, transparent 0%, rgba(0,0,0,0.92) 24%, #000 100%)',
          }}
        />
      )}

      {/* Subtle editorial left vignette for effortless typography contrast while keeping full-body art crisp on the right */}
      <div
        className="pointer-events-none absolute inset-0 transition-opacity duration-500"
        style={{
          background:
            'linear-gradient(95deg, rgba(9,9,11,0.72) 0%, rgba(9,9,11,0.38) 46%, rgba(9,9,11,0.06) 100%)',
          opacity: hasValidBg ? Math.max(0.25, Math.min(0.95, overlayOpacity + 0.15)) : 0,
        }}
      />

      {/* Subtle bottom anchor gradient */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            variant === 'popup'
              ? 'linear-gradient(0deg, rgba(9,9,11,0.88) 0%, rgba(9,9,11,0.28) 45%, rgba(9,9,11,0.55) 100%)'
              : 'linear-gradient(0deg, rgba(9,9,11,0.92) 0%, rgba(9,9,11,0.18) 38%, rgba(9,9,11,0.45) 100%)',
        }}
      />

      {/* Minimalist low-poly geometric wireframe accent */}
      <svg
        aria-hidden="true"
        viewBox="0 0 600 400"
        className="pointer-events-none absolute -left-16 bottom-0 h-80 w-[30rem] opacity-[0.055]"
      >
        <g stroke="currentColor" strokeWidth="0.75" fill="none" className="text-white">
          <polygon points="20,390 140,250 230,360" />
          <polygon points="140,250 290,290 230,360" />
          <polygon points="20,390 230,360 340,400" />
          <polygon points="140,250 240,160 290,290" />
          <polygon points="290,290 420,340 340,400" />
        </g>
      </svg>

      {/* Whisper-quiet top accent hairline */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[1px]"
        style={{
          background: `linear-gradient(90deg, transparent 0%, ${primary}66 35%, ${secondary}33 70%, transparent 100%)`,
        }}
      />

      <div className="relative z-10 flex h-full w-full flex-col">{children}</div>
    </div>
  );
};
