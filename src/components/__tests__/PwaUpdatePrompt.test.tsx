// @vitest-environment jsdom

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PwaUpdatePrompt } from '../PwaUpdatePrompt';

type RegisterSwOptions = {
  readonly immediate?: boolean;
  readonly onNeedRefresh?: () => void;
  readonly onOfflineReady?: () => void;
};

const mockedState = vi.hoisted(() => ({
  lastRegisterSwOptions: null as RegisterSwOptions | null,
  recordingControllerState: {
    isProcessingCapture: false,
    isRecording: false,
    isTimelapseCapturing: false,
  },
  registerSwMock: vi.fn(),
  triggerServiceWorkerUpdateMock: vi.fn(
    (_reloadPage?: boolean): Promise<void> => Promise.resolve(),
  ),
}));

vi.mock('virtual:pwa-register', (): { registerSW: typeof mockedState.registerSwMock } => ({
  registerSW: mockedState.registerSwMock,
}));

vi.mock('../../controllers/RecordingController', (): {
  useRecordingController: () => typeof mockedState.recordingControllerState;
} => ({
  useRecordingController: () => mockedState.recordingControllerState,
}));

describe('PwaUpdatePrompt', () => {
  beforeEach(() => {
    mockedState.registerSwMock.mockImplementation((options: RegisterSwOptions) => {
      mockedState.lastRegisterSwOptions = options;
      return mockedState.triggerServiceWorkerUpdateMock;
    });
    mockedState.registerSwMock.mockClear();
    mockedState.triggerServiceWorkerUpdateMock.mockClear();
    mockedState.lastRegisterSwOptions = null;
    Object.assign(mockedState.recordingControllerState, {
      isProcessingCapture: false,
      isRecording: false,
      isTimelapseCapturing: false,
    });
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it('persists pending update state when a new service worker is ready', () => {
    render(<PwaUpdatePrompt />);

    expect(mockedState.registerSwMock).toHaveBeenCalledTimes(1);
    expect(mockedState.lastRegisterSwOptions?.immediate).toBe(true);

    act((): void => {
      mockedState.lastRegisterSwOptions?.onNeedRefresh?.();
    });

    expect(screen.getByText('Update ready')).not.toBeNull();
    expect(
      JSON.parse(window.localStorage.getItem('auteura-pwa-update-pending') ?? 'null'),
    ).toMatchObject({
      dismissedAt: null,
    });
  });

  it('restores a dismissed update and resurfaces it after the reminder delay', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-15T12:00:00.000Z'));

    const rendered = render(<PwaUpdatePrompt />);

    act((): void => {
      mockedState.lastRegisterSwOptions?.onNeedRefresh?.();
    });
    expect(screen.getByText('Update ready')).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Later' }));
    expect(window.localStorage.getItem('auteura-pwa-update-pending')).toContain('"dismissedAt":');

    rendered.unmount();
    render(<PwaUpdatePrompt />);

    expect(screen.queryByText('Update ready')).toBeNull();

    act((): void => {
      vi.advanceTimersByTime(15 * 60 * 1000);
    });

    expect(screen.getByText('Update ready')).not.toBeNull();
  });

  it('keeps the update action disabled while capture is active', () => {
    Object.assign(mockedState.recordingControllerState, {
      isProcessingCapture: false,
      isRecording: true,
      isTimelapseCapturing: false,
    });

    render(<PwaUpdatePrompt />);

    act((): void => {
      mockedState.lastRegisterSwOptions?.onNeedRefresh?.();
    });

    expect(screen.getByRole('button', { name: 'Update now' }).hasAttribute('disabled')).toBe(true);
  });

  it('clears pending state when applying the update', async () => {
    render(<PwaUpdatePrompt />);

    act((): void => {
      mockedState.lastRegisterSwOptions?.onNeedRefresh?.();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Update now' }));

    await waitFor(() => {
      expect(mockedState.triggerServiceWorkerUpdateMock).toHaveBeenCalledWith(true);
    });
    expect(window.localStorage.getItem('auteura-pwa-update-pending')).toBeNull();
  });
});
