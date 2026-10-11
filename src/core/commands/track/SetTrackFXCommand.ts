import { KGCommand } from '../KGCommand';
import type { KGTrack } from '../../track/KGTrack';
import type { KGFX } from '../../fx';
import { translate } from '../../../i18n/translate';

/** Independent snapshots prevent later edits from corrupting undo. */
export class SetTrackFXCommand extends KGCommand {
  private readonly before: KGFX[];
  private readonly after: KGFX[];
  constructor(private readonly track: KGTrack, effects: readonly KGFX[], private readonly mergeKey?: string) {
    super();
    this.before = track.getFX().map(effect => effect.clone());
    this.after = effects.map(effect => effect.clone());
  }
  execute(): void { this.track.setFX(this.after); }
  undo(): void { this.track.setFX(this.before); }
  getDescription(): string { return translate('fx.history.update', { track: this.track.getName() }); }
  canMergeWith(other: KGCommand): boolean {
    return other instanceof SetTrackFXCommand && other.track === this.track && !!this.mergeKey
      && other.mergeKey === this.mergeKey && other.timestamp - this.timestamp < 500;
  }
  mergeWith(other: KGCommand): KGCommand | null {
    if (!(other instanceof SetTrackFXCommand) || !this.canMergeWith(other)) return null;
    const merged = new SetTrackFXCommand(this.track, other.after, this.mergeKey);
    merged.before.splice(0, merged.before.length, ...this.before.map(effect => effect.clone()));
    return merged;
  }
}
