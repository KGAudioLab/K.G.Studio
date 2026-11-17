import type { InstVelaBundle, InstVelaVoice } from './types';

const instruments = {
  ai_violin: { preview: 'violin', bundle: 'm01-violin-onnx-v1', voice: 'string_violin', keyswitch: 36 },
  ai_viola: { preview: 'viola', bundle: 'm01-viola-onnx-v1', voice: 'string_viola', keyswitch: 36 },
  ai_cello: { preview: 'cello', bundle: 'm01-cello-onnx-v1', voice: 'string_cello', keyswitch: 24 },
  ai_double_bass: { preview: 'contrabass', bundle: 'm01-double-bass-onnx-v1', voice: 'string_double_bass', keyswitch: 12 },
} as const satisfies Record<string, { preview: string; bundle: InstVelaBundle; voice: InstVelaVoice; keyswitch: number }>;

export function getInstVelaInstrument(id: string | number) {
  return Object.hasOwn(instruments, id) ? instruments[id as keyof typeof instruments] : undefined;
}
