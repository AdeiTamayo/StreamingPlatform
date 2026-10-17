/** Arrow glyph for the sort-direction toggles on Watch Later / Last Seen. */
export default function SortDirectionIcon({
  direction,
  size = 15,
}: {
  direction: "asc" | "desc";
  size?: number;
}) {
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
      {direction === "desc" ? (
        <path d="M12 5v14M19 12l-7 7-7-7" />
      ) : (
        <path d="M12 19V5M5 12l7-7 7 7" />
      )}
    </svg>
  );
}
