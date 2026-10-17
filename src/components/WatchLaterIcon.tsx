interface WatchLaterIconProps {
  size?: number;
}

/** Clock glyph used by the watch-later toggles on cards and detail pages. */
export default function WatchLaterIcon({ size = 14 }: WatchLaterIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <polyline points="12 7 12 12 15.5 14" />
    </svg>
  );
}
