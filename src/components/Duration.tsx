import { formatRuntime } from "../utils/format";

/** Clock + runtime label, matching the detail-page duration style. */
export default function Duration({ minutes }: { minutes: number | null | undefined }) {
  const label = formatRuntime(minutes);
  if (!label) return null;
  return (
    <span className="duration">
      <svg
        width="14"
        height="14"
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
      {label}
    </span>
  );
}
