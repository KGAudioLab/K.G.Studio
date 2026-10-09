import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import AireSettings from './AireSettings';
import { AIRE_BASE_URL, aireCache } from '../../../util/aire/config';
const config = vi.hoisted(() => ({ getIsInitialized: () => true, get: vi.fn(), set: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../../../core/config/ConfigManager', () => ({ ConfigManager: { instance: () => config } }));
beforeEach(() => {
  vi.restoreAllMocks(); config.get.mockReturnValue(undefined); config.set.mockReset().mockResolvedValue(undefined);
  vi.spyOn(aireCache, 'exists').mockResolvedValue(true);
});
describe('AIRE settings', () => {
  it('uses the approved default URL and saves only valid base URLs', async () => {
    render(<AireSettings />);
    const input = screen.getByLabelText('Model Base URL');
    await waitFor(() => expect(screen.getByText('3 of 3 models cached')).toBeInTheDocument());
    expect(input).toHaveValue(AIRE_BASE_URL);
    fireEvent.change(input, { target: { value: 'file:///models/' } });
    expect(screen.getByRole('alert')).toHaveTextContent('HTTP or HTTPS'); expect(config.set).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: 'https://mirror.example/models/' } });
    await waitFor(() => expect(config.set).toHaveBeenCalledWith('general.aire.base_url', 'https://mirror.example/models/'));
  });
  it('deletes all three family model files and refreshes the cache count', async () => {
    const remove = vi.spyOn(aireCache, 'delete').mockResolvedValue(undefined);
    render(<AireSettings />); const button = screen.getByRole('button'); await waitFor(() => expect(button).toBeEnabled());
    vi.mocked(aireCache.exists).mockResolvedValue(false);
    fireEvent.click(button);
    await waitFor(() => expect(screen.getByText('0 of 3 models cached')).toBeInTheDocument());
    expect(remove.mock.calls.map(c => c[0])).toEqual(['aire-strings-a02b-s03/model.onnx', 'aire-brass-a02b-b01/model.onnx', 'aire-woodwind-a02b-w01/model.onnx']);
  });
});
