import * as React from 'react';

interface RiftLogoProps extends React.SVGProps<SVGSVGElement> {
  size?: number;
  monochrome?: boolean;
}

/**
 * Geometric RiftQL mark: rounded square split by a diagonal rift revealing the accent beam.
 */
export function RiftLogo({ size = 20, monochrome = false, className, ...props }: RiftLogoProps) {
  const id = React.useId();
  const clipId = `rift-clip-${id}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={className}
      {...props}
    >
      <defs>
        <clipPath id={clipId}>
          <rect x="2" y="2" width="28" height="28" rx="6.5" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <polygon
          points="2,2 21,2 9.5,30 2,30"
          fill={monochrome ? 'currentColor' : 'var(--bg-elevated)'}
          fillOpacity={monochrome ? 0.85 : 1}
        />
        <polygon
          points="23.5,2 30,2 30,30 12,30"
          fill={monochrome ? 'currentColor' : 'var(--border-subtle)'}
          fillOpacity={monochrome ? 0.45 : 1}
        />
        <polygon
          points="20,2 24,2 12.5,30 8.5,30"
          fill={monochrome ? 'currentColor' : 'var(--accent)'}
        />
      </g>
      <rect
        x="2.5"
        y="2.5"
        width="27"
        height="27"
        rx="6"
        stroke={monochrome ? 'currentColor' : 'var(--border-strong)'}
        strokeOpacity={monochrome ? 0.5 : 0.7}
        strokeWidth="1"
      />
    </svg>
  );
}
