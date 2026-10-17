import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import useDropdownKeys from '../useDropdownKeys';
import useDropdownSearch from '../useDropdownSearch';

function KeysHarness({
  onActivate,
  onClose,
}: {
  onActivate: (index: number) => void;
  onClose: () => void;
}) {
  const activeIndex = useDropdownKeys(true, 3, onActivate, onClose);
  return (
    <div>
      <input data-testid="other-input" />
      <span data-testid="active-index">{activeIndex}</span>
    </div>
  );
}

function SearchHarness({ onClose }: { onClose: () => void }) {
  const search = useDropdownSearch(true, onClose);
  return <span data-testid="search">{search}</span>;
}

// The document-level handlers used to swallow every keystroke while a
// dropdown was open - typing in the navbar search fed the typeahead buffer
// and Enter submitted the dropdown instead of the focused form.
describe('dropdown key hooks vs typing targets', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('ignores typeahead keystrokes aimed at a focused input', () => {
    render(
      <div>
        <SearchHarness onClose={vi.fn()} />
        <input data-testid="other-input" />
      </div>,
    );
    const input = screen.getByTestId('other-input');

    fireEvent.keyDown(input, { key: 'a' });

    expect(screen.getByTestId('search').textContent).toBe('');
  });

  it('still feeds typeahead from non-input targets', () => {
    render(<SearchHarness onClose={vi.fn()} />);
    fireEvent.keyDown(document.body, { key: 'a' });
    expect(screen.getByTestId('search').textContent).toBe('a');
  });

  it('does not activate an option on Enter pressed in an input', () => {
    const onActivate = vi.fn();
    render(<KeysHarness onActivate={onActivate} onClose={vi.fn()} />);
    const input = screen.getByTestId('other-input');

    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onActivate).not.toHaveBeenCalled();
  });

  it('does not move the highlight with arrows pressed in an input', () => {
    render(<KeysHarness onActivate={vi.fn()} onClose={vi.fn()} />);
    const input = screen.getByTestId('other-input');

    fireEvent.keyDown(input, { key: 'ArrowDown' });

    expect(screen.getByTestId('active-index').textContent).toBe('0');
  });

  it('still navigates with arrows on non-input targets', () => {
    render(<KeysHarness onActivate={vi.fn()} onClose={vi.fn()} />);
    fireEvent.keyDown(document.body, { key: 'ArrowDown' });
    expect(screen.getByTestId('active-index').textContent).toBe('1');
  });
});
