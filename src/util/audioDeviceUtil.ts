export type AudioDeviceKind = 'audioinput' | 'audiooutput';

export interface AudioDeviceOption {
  deviceId: string;
  label: string;
  kind: AudioDeviceKind;
  isDefault: boolean;
}

export interface AudioDeviceSnapshot {
  inputs: AudioDeviceOption[];
  outputs: AudioDeviceOption[];
  labelsAvailable: boolean;
  canSelectOutput: boolean;
  canWatchDeviceChanges: boolean;
}

export interface AudioDeviceValidationResult {
  inputDeviceId: string;
  outputDeviceId: string;
  inputFellBackToDefault: boolean;
  outputFellBackToDefault: boolean;
}

const DEFAULT_DEVICE_ID = 'default';
const COMMUNICATIONS_DEVICE_ID = 'communications';

export function getDefaultAudioDeviceOption(kind: AudioDeviceKind): AudioDeviceOption {
  return {
    deviceId: DEFAULT_DEVICE_ID,
    label: 'System Default',
    kind,
    isDefault: true,
  };
}

export function supportsDeviceEnumeration(): boolean {
  return typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.enumerateDevices === 'function';
}

export function supportsDeviceChangeEvents(): boolean {
  return typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.addEventListener === 'function';
}

export function supportsAudioOutputSelection(): boolean {
  return typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices &&
    typeof (navigator.mediaDevices as MediaDevices & {
      selectAudioOutput?: () => Promise<MediaDeviceInfo>;
    }).selectAudioOutput === 'function';
}

export function supportsAudioContextSinkSelection(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  return typeof (window.AudioContext?.prototype as AudioContext & {
    setSinkId?: (sinkId: string) => Promise<void>;
  } | undefined)?.setSinkId === 'function';
}

export async function enumerateAudioDevices(): Promise<AudioDeviceSnapshot> {
  const fallback: AudioDeviceSnapshot = {
    inputs: [getDefaultAudioDeviceOption('audioinput')],
    outputs: [getDefaultAudioDeviceOption('audiooutput')],
    labelsAvailable: false,
    canSelectOutput: supportsAudioOutputSelection(),
    canWatchDeviceChanges: supportsDeviceChangeEvents(),
  };

  if (!supportsDeviceEnumeration()) {
    return fallback;
  }

  const devices = await navigator.mediaDevices.enumerateDevices();
  const labelsAvailable = devices.some(device => device.label.trim().length > 0);

  const inputs = normalizeAudioDevices(devices, 'audioinput');
  const outputs = normalizeAudioDevices(devices, 'audiooutput');

  return {
    inputs,
    outputs,
    labelsAvailable,
    canSelectOutput: supportsAudioOutputSelection(),
    canWatchDeviceChanges: supportsDeviceChangeEvents(),
  };
}

export function validateConfiguredAudioDevices(
  inputDeviceId: string | undefined,
  outputDeviceId: string | undefined,
  snapshot: AudioDeviceSnapshot
): AudioDeviceValidationResult {
  const normalizedInputId = inputDeviceId ?? DEFAULT_DEVICE_ID;
  const normalizedOutputId = outputDeviceId ?? DEFAULT_DEVICE_ID;

  const canValidateInput = snapshot.labelsAvailable || snapshot.inputs.some(device => device.deviceId === normalizedInputId);
  const canValidateOutput = snapshot.labelsAvailable || snapshot.outputs.some(device => device.deviceId === normalizedOutputId);

  const validInput = normalizedInputId === DEFAULT_DEVICE_ID ||
    !canValidateInput ||
    snapshot.inputs.some(device => device.deviceId === normalizedInputId);
  const validOutput = normalizedOutputId === DEFAULT_DEVICE_ID ||
    !canValidateOutput ||
    snapshot.outputs.some(device => device.deviceId === normalizedOutputId);

  return {
    inputDeviceId: validInput ? normalizedInputId : DEFAULT_DEVICE_ID,
    outputDeviceId: validOutput ? normalizedOutputId : DEFAULT_DEVICE_ID,
    inputFellBackToDefault: !validInput,
    outputFellBackToDefault: !validOutput,
  };
}

export async function promptForAudioOutputDevice(): Promise<AudioDeviceOption | null> {
  if (!supportsAudioOutputSelection()) {
    return null;
  }

  const selected = await (navigator.mediaDevices as MediaDevices & {
    selectAudioOutput: () => Promise<MediaDeviceInfo>;
  }).selectAudioOutput();
  return {
    deviceId: selected.deviceId,
    label: selected.label || 'Selected Output Device',
    kind: 'audiooutput',
    isDefault: false,
  };
}

function normalizeAudioDevices(
  devices: MediaDeviceInfo[],
  kind: AudioDeviceKind
): AudioDeviceOption[] {
  const normalized: AudioDeviceOption[] = [getDefaultAudioDeviceOption(kind)];
  let unnamedCount = 1;

  devices
    .filter(device => device.kind === kind)
    .forEach(device => {
      if (device.deviceId === DEFAULT_DEVICE_ID || device.deviceId === COMMUNICATIONS_DEVICE_ID) {
        return;
      }

      normalized.push({
        deviceId: device.deviceId,
        label: device.label || `${kind === 'audioinput' ? 'Input' : 'Output'} Device ${unnamedCount++}`,
        kind,
        isDefault: false,
      });
    });

  return normalized;
}
