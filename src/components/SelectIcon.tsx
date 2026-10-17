/** Checklist glyph used by the Select-mode toggles on Watch Later / Last Seen. */
export default function SelectIcon({ size = 18 }: { size?: number }) {
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
      <path d="M3 5l1.7 1.7L8.3 3.7" />
      <path d="M11 4h10" />
      <path d="M11 7h6" />
      <path d="M3 12l1.7 1.7L8.3 10.7" />
      <path d="M11 11h10" />
      <path d="M11 14h6" />
      <path d="M3 19l1.7 1.7L8.3 17.7" />
      <path d="M11 18h10" />
      <path d="M11 21h6" />
    </svg>
  );
}
