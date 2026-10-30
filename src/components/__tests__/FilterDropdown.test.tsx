import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import FilterDropdown from '../FilterDropdown';

const options = [
  { value: '', label: 'All genres' },
  { value: '28', label: 'Action' },
];

describe('FilterDropdown', () => {
  it('marks the trigger as active only when a non-default value is selected', () => {
    const { container, rerender } = render(
      <FilterDropdown
        value=""
        options={options}
        placeholder="All genres"
        onSelect={() => {}}
        className="query-select"
      />,
    );

    expect(container.querySelector('.query-select')).not.toHaveClass('has-value');

    rerender(
      <FilterDropdown
        value="28"
        options={options}
        placeholder="All genres"
        onSelect={() => {}}
        className="query-select"
      />,
    );

    expect(container.querySelector('.query-select')).toHaveClass('has-value');
  });
});
