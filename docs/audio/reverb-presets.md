# Initial Reverb preset selection

Use this shortlist as the starting point; manual listening evaluation is deferred. The existing KGReverbFX defaults are Chamber and 33% Dry/Wet. Preserve Wet when changing the reverb type. No additional pre-delay, time stretching or preset gain compensation is selected yet.

| Type | Candidate source file | Original duration |
| --- | --- | --- |
| Hall | 480L Halls 03 Medium Hall.wav | 2.987 s |
| Room | 480L Rooms 05 Very Small Room.wav | 1.227 s |
| Chamber | Lexicon 300 Chamber.wav | 2.006 s |
| Plate | EMT 21 Natural Plate 01.wav | 2.985 s |
| Spring | BX20E1 01.wav | 4.821 s |

Durations are file lengths, not measured RT60 values. All five are stereo, 48 kHz, 24-bit WAVs. The local evaluation versions retain the original length and amplitude with a 50 ms linear endpoint fade. The comparison page uses native Web Audio convolution, normalization enabled, a linear dry/wet mix, and an optional manual wet-level adjustment. Normalization does not guarantee equal perceived loudness. These are provisional starting settings, not an approved production gain calibration.

## Preserved comparison page

The page, WAVs, originals, manifest, and verification results are preserved in `reverb-audition.local/` at the repository root. The existing `*.local` Git ignore rule excludes these evaluation assets. They are outside the public resource directory and are not included in the application build.

```sh
python3 -m http.server 8766 --bind 127.0.0.1 --directory reverb-audition.local
```

Open http://127.0.0.1:8766/. The page supports the existing app test clips, uploading an audio recording, preset selection, dry comparison, wet-level adjustment, and one-shot playback with the reverb tail. See the local README for details.

## Source and license status

Author: Greg Hopkins. Source: https://hopkinsmedia.services/ir, original Hopkins IR Collection.

The project owner confirmed Creative Commons Attribution (CC BY) on 2026-10-11. The exact version is unspecified. Commercial use is permitted under the applicable CC BY terms; the temporary non-commercial restriction is removed. Retain author credit, source link, and notice of modifications when redistributing the IR assets. See LICENSE and public/resources/fx/reverb/README.md. The local inquiry is preserved as a historical unsent draft.

Manual testing was deferred; browser decoding and convolution checks passed for all five files. Reverb audio is now integrated in KGTrackFXChain. The bundled IRs are in public/resources/fx/reverb/ and a build-included comparison page is preserved at public/reverb-comparison.html. The original local evaluation copy is also retained.
