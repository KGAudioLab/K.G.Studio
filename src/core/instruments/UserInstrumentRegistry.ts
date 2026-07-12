import { FLUIDR3_INSTRUMENT_MAP } from '../../constants/generalMidiConstants';
import { isValidProjectName } from '../../util/projectNameUtil';

export interface UserInstrumentSample {
  pitch: number;
  storedFileName: string;
  originalFileName: string;
}

export interface UserInstrumentDefinition {
  instrumentId: string;
  displayName: string;
  midiInstrument: number;
  enabled: boolean;
  image: string;
  pitchRange: [number, number];
  percussion: boolean;
  fallbackInstrument: string;
  samples: Record<string, UserInstrumentSample>;
}

const ROOT = 'soundfont';
const USER_DIR = 'user';
const REGISTRY_FILE = 'instruments.json';
const DEFAULT_IMAGE = 'piano.png';
const DEFAULT_FALLBACK = 'acoustic_grand_piano';

type Listener = () => void;

export class UserInstrumentRegistry {
  private static definitions = new Map<string, UserInstrumentDefinition>();
  private static initialized = false;
  private static listeners = new Set<Listener>();

  static async initialize(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
    if (!navigator.storage?.getDirectory) return;
    try {
      const dir = await this.getUserDirectory(true);
      const handle = await dir.getFileHandle(REGISTRY_FILE);
      const parsed = JSON.parse(await (await handle.getFile()).text()) as UserInstrumentDefinition[];
      this.definitions = new Map(parsed.map(item => [item.instrumentId, item]));
    } catch (error) {
      if ((error as DOMException)?.name !== 'NotFoundError') console.warn('Failed to load user instruments:', error);
    }
    this.emit();
  }

  static isInitialized(): boolean { return this.initialized; }
  static list(): UserInstrumentDefinition[] { return [...this.definitions.values()]; }
  static listEnabled(): UserInstrumentDefinition[] { return this.list().filter(item => item.enabled); }
  static get(id: string): UserInstrumentDefinition | undefined { return this.definitions.get(id); }
  static isUserInstrument(id: string): boolean { return this.definitions.has(id); }
  static subscribe(listener: Listener): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }

  static async create(displayName: string): Promise<UserInstrumentDefinition> {
    if (!isValidProjectName(displayName)) throw new Error('Invalid instrument name');
    await this.initialize();
    const base = displayName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'instrument';
    let id = base;
    let suffix = 2;
    while (this.definitions.has(id) || FLUIDR3_INSTRUMENT_MAP[id]) id = `${base}_${suffix++}`;
    const used = new Set(this.list().map(item => item.midiInstrument));
    let midiInstrument = 1001;
    while (used.has(midiInstrument)) midiInstrument++;
    const definition: UserInstrumentDefinition = {
      instrumentId: id, displayName: displayName.trim(), midiInstrument, enabled: false,
      image: DEFAULT_IMAGE, pitchRange: [21, 108], percussion: false,
      fallbackInstrument: DEFAULT_FALLBACK, samples: {},
    };
    this.definitions.set(id, definition);
    await (await this.getUserDirectory(true)).getDirectoryHandle(id, { create: true });
    await this.persist();
    return definition;
  }

  static async update(id: string, patch: Partial<Omit<UserInstrumentDefinition, 'instrumentId' | 'midiInstrument' | 'samples'>>): Promise<UserInstrumentDefinition> {
    const current = this.require(id);
    if (patch.displayName !== undefined && !isValidProjectName(patch.displayName)) throw new Error('Invalid instrument name');
    if (patch.fallbackInstrument && !FLUIDR3_INSTRUMENT_MAP[patch.fallbackInstrument]) throw new Error('Invalid fallback instrument');
    const next = { ...current, ...patch, instrumentId: current.instrumentId, midiInstrument: current.midiInstrument };
    if (next.pitchRange[0] < 0 || next.pitchRange[1] > 127 || next.pitchRange[0] > next.pitchRange[1]) throw new Error('Invalid pitch range');
    if (next.enabled && !this.hasInRangeSample(next)) throw new Error('At least one in-range sample is required');
    this.definitions.set(id, next);
    await this.persist();
    return next;
  }

  static async storeSample(id: string, pitch: number, file: File): Promise<UserInstrumentDefinition> {
    if (pitch < 0 || pitch > 127) throw new Error('Invalid pitch');
    if (!this.isSupportedAudioFile(file)) throw new Error('Only WAV and MP3 files are supported');
    const current = this.require(id);
    const extension = file.name.toLowerCase().endsWith('.wav') ? '.wav' : '.mp3';
    const storedFileName = `${pitch}${extension}`;
    const dir = await (await this.getUserDirectory(true)).getDirectoryHandle(id, { create: true });
    const writable = await (await dir.getFileHandle(storedFileName, { create: true })).createWritable();
    await writable.write(file);
    await writable.close();
    const previous = current.samples[String(pitch)];
    if (previous && previous.storedFileName !== storedFileName) await dir.removeEntry(previous.storedFileName).catch(() => undefined);
    const next = { ...current, samples: { ...current.samples, [String(pitch)]: { pitch, storedFileName, originalFileName: file.name } } };
    this.definitions.set(id, next);
    await this.persist();
    return next;
  }

  static async deleteSample(id: string, pitch: number): Promise<UserInstrumentDefinition> {
    const current = this.require(id);
    const sample = current.samples[String(pitch)];
    if (!sample) return current;
    const dir = await (await this.getUserDirectory(true)).getDirectoryHandle(id, { create: true });
    await dir.removeEntry(sample.storedFileName).catch(() => undefined);
    const samples = { ...current.samples };
    delete samples[String(pitch)];
    const next = { ...current, samples, enabled: current.enabled && this.hasInRangeSample({ ...current, samples }) };
    this.definitions.set(id, next);
    await this.persist();
    return next;
  }

  static async delete(id: string): Promise<void> {
    this.require(id);
    this.definitions.delete(id);
    const userDir = await this.getUserDirectory(true);
    await userDir.removeEntry(id, { recursive: true }).catch(() => undefined);
    await this.persist();
  }

  static async getSampleFiles(id: string): Promise<Record<string, File>> {
    const definition = this.require(id);
    const dir = await (await this.getUserDirectory()).getDirectoryHandle(id);
    const result: Record<string, File> = {};
    await Promise.all(Object.values(definition.samples).map(async sample => {
      result[String(sample.pitch)] = await (await dir.getFileHandle(sample.storedFileName)).getFile();
    }));
    return result;
  }

  static async getSampleFile(id: string, pitch: number): Promise<File> {
    const definition = this.require(id);
    const sample = definition.samples[String(pitch)];
    if (!sample) throw new Error(`No sample is assigned to pitch ${pitch}`);
    const dir = await (await this.getUserDirectory()).getDirectoryHandle(id);
    return (await dir.getFileHandle(sample.storedFileName)).getFile();
  }

  static hasInRangeSample(definition: UserInstrumentDefinition): boolean {
    return Object.values(definition.samples).some(sample => sample.pitch >= definition.pitchRange[0] && sample.pitch <= definition.pitchRange[1]);
  }

  static resolvePlaybackInstrument(id: string): string {
    const definition = this.get(id);
    if (!definition) return FLUIDR3_INSTRUMENT_MAP[id] ? id : DEFAULT_FALLBACK;
    return definition.enabled && this.hasInRangeSample(definition) ? id : definition.fallbackInstrument;
  }

  static isSupportedAudioFile(file: File): boolean {
    const name = file.name.toLowerCase();
    return name.endsWith('.wav') || name.endsWith('.mp3');
  }

  static async resetForTests(): Promise<void> { this.definitions.clear(); this.initialized = false; this.listeners.clear(); }

  private static require(id: string): UserInstrumentDefinition {
    const definition = this.definitions.get(id);
    if (!definition) throw new Error(`Unknown user instrument: ${id}`);
    return definition;
  }

  private static async persist(): Promise<void> {
    const dir = await this.getUserDirectory(true);
    const writable = await (await dir.getFileHandle(REGISTRY_FILE, { create: true })).createWritable();
    await writable.write(JSON.stringify(this.list(), null, 2));
    await writable.close();
    this.emit();
  }

  private static emit(): void { this.listeners.forEach(listener => listener()); }

  private static async getUserDirectory(create = false): Promise<FileSystemDirectoryHandle> {
    let dir = await navigator.storage.getDirectory();
    dir = await dir.getDirectoryHandle(ROOT, { create });
    return dir.getDirectoryHandle(USER_DIR, { create });
  }
}
