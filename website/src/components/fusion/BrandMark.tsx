type Props = {
  size?: number;
  className?: string;
};

export default function BrandMark({ size = 22, className }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M 5 7 L 12 3.5 L 19 7 L 19 17 L 12 20.5 L 5 17 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <rect x="8" y="9.8" width="6" height="1.4" fill="#1e45e4" />
      <rect x="8" y="12.3" width="8" height="1.4" fill="#e11d1d" />
      <rect x="8" y="14.8" width="4" height="1.4" fill="#1e45e4" />
    </svg>
  );
}
