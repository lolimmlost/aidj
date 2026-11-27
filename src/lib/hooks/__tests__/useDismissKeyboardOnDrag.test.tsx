import { describe, it, expect, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { useDismissKeyboardOnDrag } from '../useDismissKeyboardOnDrag';

function Page() {
  useDismissKeyboardOnDrag();
  return (
    <div>
      <input data-testid="field" type="text" />
      <input data-testid="range" type="range" />
      <ul data-testid="results">
        <li>Song</li>
      </ul>
    </div>
  );
}

const touch = (x: number, y: number) => ({ touches: [{ clientX: x, clientY: y }] });

function drag(el: Element, dy: number) {
  fireEvent.touchStart(el, touch(100, 300));
  fireEvent.touchMove(el, touch(100, 300 + dy));
}

describe('useDismissKeyboardOnDrag', () => {
  afterEach(cleanup);

  it('lowers the keyboard when you drag the results', () => {
    const { getByTestId } = render(<Page />);
    const field = getByTestId('field');
    field.focus();
    drag(getByTestId('results'), -40);
    expect(document.activeElement).not.toBe(field);
  });

  it('keeps it up for a tap (tiny movement)', () => {
    const { getByTestId } = render(<Page />);
    const field = getByTestId('field');
    field.focus();
    drag(getByTestId('results'), 4);
    expect(document.activeElement).toBe(field);
  });

  it('keeps it up when the drag starts on the field (moving the caret)', () => {
    const { getByTestId } = render(<Page />);
    const field = getByTestId('field');
    field.focus();
    drag(field, 60);
    expect(document.activeElement).toBe(field);
  });

  it('leaves non-text controls alone', () => {
    const { getByTestId } = render(<Page />);
    const range = getByTestId('range');
    range.focus();
    drag(getByTestId('results'), -40);
    expect(document.activeElement).toBe(range);
  });
});
