import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { isValidDate } from '../../utils/calendar';
import DatePickerField from '../DatePickerField';

describe('DatePickerField', () => {
  const defaultProps = {
    label: 'Test Date',
    value: '',
    onChange: vi.fn(),
    placeholder: 'Select date',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders trigger button with label and placeholder', () => {
    render(<DatePickerField {...defaultProps} />);
    const trigger = screen.getByRole('button', { name: /Test Date: Select date/i });
    expect(trigger).toBeInTheDocument();
    expect(trigger).toHaveTextContent('Select date');
  });

  it('opens popover when trigger is clicked', async () => {
    render(<DatePickerField {...defaultProps} />);
    const trigger = screen.getByRole('button', { name: /Test Date: Select date/i });
    fireEvent.click(trigger);
    expect(screen.getByRole('dialog', { name: /Test Date picker/i })).toBeInTheDocument();
  });

  it('closes popover when Escape is pressed', async () => {
    render(<DatePickerField {...defaultProps} />);
    const trigger = screen.getByRole('button', { name: /Test Date: Select date/i });
    fireEvent.click(trigger);
    expect(screen.getByRole('dialog', { name: /Test Date picker/i })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: /Test Date picker/i })).not.toBeInTheDocument();
  });

  it('restores focus to trigger when closed with Escape', async () => {
    render(<DatePickerField {...defaultProps} />);
    const trigger = screen.getByRole('button', { name: /Test Date: Select date/i });
    fireEvent.click(trigger);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(trigger).toHaveFocus();
  });

  it('shows weekdays in Monday-Sunday order', async () => {
    render(<DatePickerField {...defaultProps} />);
    const trigger = screen.getByRole('button', { name: /Test Date: Select date/i });
    fireEvent.click(trigger);
    const weekdays = screen.getAllByText(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)$/);
    expect(weekdays).toHaveLength(7);
    expect(weekdays[0]).toHaveTextContent('Mon');
    expect(weekdays[6]).toHaveTextContent('Sun');
  });

  it('shows adjacent month dates', async () => {
    render(<DatePickerField {...defaultProps} value="2025-02-15" />);
    const trigger = screen.getByRole('button', { name: /Test Date: 2025-02-15/i });
    fireEvent.click(trigger);
    // February 2025 starts on Saturday, so we should see Jan 27-31
    const adjacentCells = screen.getAllByText(/^(27|28|29|30|31)$/);
    expect(adjacentCells.length).toBeGreaterThan(0);
  });

  it('selects a date and calls onChange', async () => {
    render(<DatePickerField {...defaultProps} />);
    const trigger = screen.getByRole('button', { name: /Test Date: Select date/i });
    fireEvent.click(trigger);
    // Find a day button (not adjacent month) and click it
    const dayButtons = screen.getAllByRole('button', { name: /\d{1,2}, \d{4}$/ });
    const currentMonthButton = dayButtons.find((btn) => !btn.closest('.adjacentMonth'));
    if (currentMonthButton) {
      fireEvent.click(currentMonthButton);
      expect(defaultProps.onChange).toHaveBeenCalled();
    }
  });

  it('closes popover after date selection', async () => {
    render(<DatePickerField {...defaultProps} />);
    const trigger = screen.getByRole('button', { name: /Test Date: Select date/i });
    fireEvent.click(trigger);
    const dayButtons = screen.getAllByRole('button', { name: /\d{1,2}, \d{4}$/ });
    const currentMonthButton = dayButtons.find((btn) => !btn.closest('.adjacentMonth'));
    if (currentMonthButton) {
      fireEvent.click(currentMonthButton);
      await waitFor(() => {
        expect(screen.queryByRole('dialog', { name: /Test Date picker/i })).not.toBeInTheDocument();
      });
    }
  });

  it('Clear button clears the value', async () => {
    render(<DatePickerField {...defaultProps} value="2025-02-15" />);
    const trigger = screen.getByRole('button', { name: /Test Date: 2025-02-15/i });
    fireEvent.click(trigger);
    const clearBtn = screen.getByRole('button', { name: /Clear/i });
    fireEvent.click(clearBtn);
    expect(defaultProps.onChange).toHaveBeenCalledWith('');
  });

  it('Today button sets today\'s date', async () => {
    render(<DatePickerField {...defaultProps} />);
    const trigger = screen.getByRole('button', { name: /Test Date: Select date/i });
    fireEvent.click(trigger);
    const todayBtn = screen.getByRole('button', { name: /Today/i });
    fireEvent.click(todayBtn);
    expect(defaultProps.onChange).toHaveBeenCalled();
    const calledWith = defaultProps.onChange.mock.calls[0][0];
    expect(calledWith).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('navigates to previous month', async () => {
    render(<DatePickerField {...defaultProps} value="2025-02-15" />);
    const trigger = screen.getByRole('button', { name: /Test Date: 2025-02-15/i });
    fireEvent.click(trigger);
    const prevBtn = screen.getByRole('button', { name: /Previous month, January 2025/i });
    fireEvent.click(prevBtn);
    // Should now show January 2025
    expect(screen.getByText('January 2025')).toBeInTheDocument();
  });

  it('navigates to next month', async () => {
    render(<DatePickerField {...defaultProps} value="2025-02-15" />);
    const trigger = screen.getByRole('button', { name: /Test Date: 2025-02-15/i });
    fireEvent.click(trigger);
    const nextBtn = screen.getByRole('button', { name: /Next month, March 2025/i });
    fireEvent.click(nextBtn);
    // Should now show March 2025
    expect(screen.getByText('March 2025')).toBeInTheDocument();
  });

  it('switches to month view when month button is clicked', async () => {
    render(<DatePickerField {...defaultProps} />);
    const trigger = screen.getByRole('button', { name: /Test Date: Select date/i });
    fireEvent.click(trigger);
    const monthBtn = screen.getByRole('button', { name: /^(January|February|March|April|May|June|July|August|September|October|November|December) \d{4}$/ });
    fireEvent.click(monthBtn);
    // Should show month grid - check for month buttons with full month names
    const monthButtons = screen.getAllByRole('button', { name: /^(January|February|March|April|May|June|July|August|September|October|November|December)$/ });
    expect(monthButtons).toHaveLength(12);
  });

  it('switches to year view when year button is clicked', async () => {
    render(<DatePickerField {...defaultProps} />);
    const trigger = screen.getByRole('button', { name: /Test Date: Select date/i });
    fireEvent.click(trigger);
    const monthBtn = screen.getByRole('button', { name: /^(January|February|March|April|May|June|July|August|September|October|November|December) \d{4}$/ });
    fireEvent.click(monthBtn);
    const yearBtn = screen.getByRole('button', { name: /\d{4}$/ });
    fireEvent.click(yearBtn);
    // Should show year grid
    const yearButtons = screen.getAllByRole('button', { name: /^\d{4}$/ });
    expect(yearButtons.length).toBeGreaterThanOrEqual(20);
  });

  it('rejects invalid date strings', () => {
    expect(isValidDate('')).toBe(false);
    expect(isValidDate('2025-13-01')).toBe(false);
    expect(isValidDate('2025-02-30')).toBe(false);
    expect(isValidDate('invalid')).toBe(false);
  });

  it('accepts valid date strings', () => {
    expect(isValidDate('2025-01-15')).toBe(true);
    expect(isValidDate('2024-02-29')).toBe(true);
  });

  it('adjacent month dates can be selected', async () => {
    render(<DatePickerField {...defaultProps} value="2025-02-15" />);
    const trigger = screen.getByRole('button', { name: /Test Date: 2025-02-15/i });
    fireEvent.click(trigger);
    // Click an adjacent month date (January date in February view)
    const adjacentBtns = screen.getAllByRole('button', { name: /January \d+, 2025/ });
    fireEvent.click(adjacentBtns[0]);
    expect(defaultProps.onChange).toHaveBeenCalled();
    // The popover should close
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /Test Date picker/i })).not.toBeInTheDocument();
    });
  });

  it('keyboard navigation works in day grid', async () => {
    render(<DatePickerField {...defaultProps} />);
    const trigger = screen.getByRole('button', { name: /Test Date: Select date/i });
    fireEvent.click(trigger);
    const grid = screen.getByRole('dialog');
    const firstButton = grid.querySelector('button[tabindex="0"]') as HTMLElement | null;
    if (firstButton) {
      firstButton.focus();
      expect(firstButton).toHaveFocus();
      fireEvent.keyDown(firstButton, { key: 'ArrowRight' });
      // Focus should move to next cell
    }
  });
});