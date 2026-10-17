// True when the event target is a text-entry surface. Global keyboard
// handlers (dropdown typeahead, page hotkeys) must ignore keystrokes that
// belong to a focused field instead of swallowing them.
export function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'SELECT' ||
      target.isContentEditable)
  );
}
