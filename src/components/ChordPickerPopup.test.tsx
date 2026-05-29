import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ChordPickerPopup from './ChordPickerPopup';

describe('ChordPickerPopup', () => {
  it('parses text input on enter and syncs the related buttons', () => {
    const onChange = vi.fn();

    render(<ChordPickerPopup value="C" onChange={onChange} />);

    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'Bm7b5' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onChange).toHaveBeenCalledWith('Bm7b5');
    expect(screen.getByRole('button', { name: 'Dim' }).className).toContain('selected');
    expect(screen.getByRole('button', { name: 'b5' }).className).toContain('selected');
    expect(screen.getByRole('button', { name: '7' }).className).toContain('selected');
  });

  it('shows an inline error for invalid text without mutating the region', () => {
    const onChange = vi.fn();

    render(<ChordPickerPopup value="C" onChange={onChange} />);

    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'invalid' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText('Unable to parse chord')).toBeInTheDocument();
  });

  it('supports selecting dim7 from the popup controls', () => {
    const onChange = vi.fn();

    render(<ChordPickerPopup value="Gdim" onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'dim7' }));

    expect(onChange).toHaveBeenCalledWith('Gdim7');
    expect(screen.getByRole('button', { name: 'Dim' }).className).toContain('selected');
    expect(screen.getByRole('button', { name: 'dim7' }).className).toContain('selected');
  });

  it('syncs the dim7 button when parsing text input', () => {
    const onChange = vi.fn();

    render(<ChordPickerPopup value="C" onChange={onChange} />);

    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'G#dim7' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onChange).toHaveBeenCalledWith('G#dim7');
    expect(screen.getByRole('button', { name: 'Dim' }).className).toContain('selected');
    expect(screen.getByRole('button', { name: 'dim7' }).className).toContain('selected');
  });

  it('intercepts tab and delegates popup bar navigation', () => {
    const onTabNavigate = vi.fn();

    render(<ChordPickerPopup value="C" onChange={vi.fn()} onTabNavigate={onTabNavigate} />);

    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Tab' });

    expect(onTabNavigate).toHaveBeenCalledWith('forward');
  });

  it('intercepts shift-tab and delegates backward popup bar navigation', () => {
    const onTabNavigate = vi.fn();

    render(<ChordPickerPopup value="C" onChange={vi.fn()} onTabNavigate={onTabNavigate} />);

    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Tab', shiftKey: true });

    expect(onTabNavigate).toHaveBeenCalledWith('backward');
  });

  it('focuses the chord input when the popup opens', () => {
    render(<ChordPickerPopup value="C" onChange={vi.fn()} />);

    expect(screen.getByRole('textbox')).toHaveFocus();
  });

  it('blocks tab navigation when the current input is invalid', () => {
    const onChange = vi.fn();
    const onTabNavigate = vi.fn();

    render(<ChordPickerPopup value="C" onChange={onChange} onTabNavigate={onTabNavigate} />);

    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'invalid' } });
    fireEvent.keyDown(input, { key: 'Tab' });

    expect(onChange).not.toHaveBeenCalled();
    expect(onTabNavigate).not.toHaveBeenCalled();
    expect(screen.getByText('Unable to parse chord')).toBeInTheDocument();
  });
});
