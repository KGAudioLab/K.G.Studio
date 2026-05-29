export const AUDIO_IMPORT_ACCEPTED_TYPES = ['.wav', '.mp3', '.ogg', '.flac', '.aac', '.m4a'] as const;

export function getAudioImportExtension(fileOrName: File | string): string {
  const fileName = typeof fileOrName === 'string' ? fileOrName : fileOrName.name;
  return `.${fileName.split('.').pop()?.toLowerCase() ?? ''}`;
}

export function isAcceptedAudioImportFile(file: File): boolean {
  return AUDIO_IMPORT_ACCEPTED_TYPES.includes(getAudioImportExtension(file) as typeof AUDIO_IMPORT_ACCEPTED_TYPES[number]);
}

export function getAudioImportDecodeFailureMessage(fileName: string): string {
  if (getAudioImportExtension(fileName) === '.m4a') {
    return `Unable to import "${fileName}". This browser could not decode the file's audio codec. M4A import depends on browser support.`;
  }

  return `Unable to import "${fileName}". This browser could not decode the selected audio file.`;
}
