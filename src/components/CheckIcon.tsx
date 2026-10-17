interface CheckIconProps {
  size?: number;
}

/** Checkmark glyph used by the watched / seen toggles on cards and lists. */
export default function CheckIcon({ size = 14 }: CheckIconProps) {
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
      <path d="M5 13l5 5L20 6" />
    </svg>
  );
}
