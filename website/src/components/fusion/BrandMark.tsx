type Props = {
  size?: number;
  className?: string;
};

// The Quipu — top cord with three knotted pendant cords.
// Andean knotted-cord device for recording public accounts; the Qipu mark.
// Renders in currentColor so the surrounding context sets the hue.
export default function BrandMark({ size = 22, className }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      className={className}
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <g transform="translate(0 -3)">
        <g stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
          <path d="M8 12 Q24 17 40 12" />
          <path d="M15 13.4 Q13.4 25 15 36" />
          <path d="M24 15 L24 44" />
          <path d="M33 13.4 Q34.6 22 33 30" />
        </g>
        <g fill="currentColor">
          <circle cx="15" cy="24" r="2.3" />
          <circle cx="24" cy="26" r="2.3" />
          <circle cx="24" cy="36" r="2.3" />
          <circle cx="33" cy="23" r="2.3" />
        </g>
      </g>
    </svg>
  );
}
