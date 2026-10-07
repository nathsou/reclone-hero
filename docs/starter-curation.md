# Starter pack curation and rework — 7 October 2026

The pack is reduced from 53 to **24 tracks**. These are editorial decisions about these particular
arrangements, not judgments of the original compositions. Removed scores and covers are recoverable
from git history. Surviving song IDs and names are unchanged, so saved library references remain stable;
retired tracks are no longer offered by the built-in source.

**Status:** every surviving score has been edited. The production build and test suite pass; all 24 complete 44.1 kHz renders have been measured. No subjective
listening pass has been performed: the authoring environment exposes rendering and measurement tools
but no audio-listening capability. The renders are review candidates, not listening-approved releases.

## Removed arrangements

| Track | Reason for removing this arrangement |
| --- | --- |
| Ode to Joy | Repeated eighth-note backing and octave/key lifts offer a weak introduction to the pack. Keep Canon's more developed variations. |
| Für Elise | The stock electronic accompaniment contributes little to the original's character; the electronic originals have clearer identities. |
| Redline | Another fast chug/gallop showcase without enough separation from Ignition, Caprice and Seventh Gear. |
| Symphony No. 5 | Familiar motif plus metal backing is less compelling as a whole arrangement than Mountain King's sustained acceleration. |
| Eine kleine Nachtmusik | Another classical melody/supersaw/house combination with little distinct production identity. |
| Symphony No. 40 | The dense drum-and-bass adaptation needs a more convincing groove and orchestration; replace with a purpose-written D&B track. |
| Prelude in C | An extended arpeggio exercise offers little arrangement development beyond its repeating texture. |
| Minuet in G | The advertised chiptune identity is diluted by generic pluck, piano, pad and drum layers. |
| William Tell Overture | The relentless gallop duplicates rhythmic territory covered more expressively by the retained metal tracks. |
| Swan Lake | Stock synthwave treatment adds little beyond a recognizable melody; retain Midnight Drive for that role. |
| Ride of the Valkyries | The synthetic orchestral/metal layering lacks the weight and phrasing that justify the adaptation. |
| The Blue Danube | Piano-to-pluck-to-supersaw changes do not amount to a coherent new waltz arrangement. |
| Morning Mood | A thin chill adaptation in an already crowded gentle-melody category; Gymnopédie has a clearer identity. |
| Funeral March | Long heavy chords and repeated backing make a less engaging playable arrangement than the retained dramatic pieces. |
| The Entertainer | It abandons its distinctive piano character for generic synth leads; a future ragtime arrangement should be rebuilt around the piano. |
| Spring | Exposed violin/orchestra writing asks too much of the small procedural orchestra; the adaptation needs a dedicated treatment. |
| Little Fugue in G minor | The two-voice reduction and one organ registration undersell its contrapuntal identity. Retain the more deliberate organ/metal contrast of Toccata. |
| Pomp and Circumstance | Stately repetition and generic brass/strings provide little rhythmic or expressive interest in this implementation. |
| Can-Can | Novelty and note density dominate; it adds less to the collection than the retained folk dances. |
| Hava Nagila | Repeated speed-ups and doubled melody duplicate the escalation already represented by Korobeiniki and Washerwoman. |
| When the Saints Go Marching In | The brass/banjo rendering does not establish a convincing New Orleans ensemble feel. |
| Mars (War Machine) | Short quoted motif plus looped original development does not sustain the implied orchestral scale. |
| Mercury (Winged Messenger) | Exposed synthetic fiddle and chromatic loops need a dedicated orchestral sound and phrasing pass. |
| Jupiter (Jollity) | The short opening quotation and stock chord/arpeggio development make an unconvincing representation of the movement. |
| Paper Hearts | Shared factory arrangement, chordal verses and a repeated hook leave too little individual identity. |
| City Lights | The same template adds less than Midnight Drive or Neon Skyline. |
| Golden Hour | Piano branding gives way to the same supersaw-chorus template; it needs an independently composed dance arrangement. |
| Prism Parade | Another high-register supersaw hook and octave-up reprise; Sunday Tape offers the stronger keys-led contrast. |
| Assembly Line | Mechanical repetition overlaps the retained heavier tracks without sufficient melodic or textural development. |

## Rework of every retained track

All 24 have explicit, deterministic phrase dynamics and articulation plans. Accents follow the actual
meter, including pickups and Seventh Gear's 7/8–4/4 changes. Short-note separation changes the shared
score used by both audio and charts; note onsets and pitches remain synchronized. Drum subdivisions
are lighter, not randomly displaced for the sake of sounding human.

| Track | Individual revision |
| --- | --- |
| Gymnopédie No. 1 | Softer accompaniment, phrase dynamics, restrained section tempo changes, bounded damper holds, and reduced reverb. |
| Midnight Drive | Verse, hook and guitar solo moved down an octave; quieter pad, shorter echo and less drum reverb. |
| Ignition | Solo moved into a more usable guitar register; quieter rhythm support and shorter lead echo. |
| Neon Skyline | Sub layer reduced and more strongly ducked; backing arpeggios now leave two-sixteenth gaps; quieter pad. |
| Canon in D | Reduced string bed, lower third variation, and a second sweep pattern that develops within the same register. |
| In the Hall of the Mountain King | Drier, quieter clean opening; first lead statement stays low, reserving the octave lift for the final escalation; less string/rhythm masking. |
| Toccata and Fugue in D minor | Opening becomes an actual playable organ passage; remove its duplicate backing line; darker, quieter organ accompaniment under the later guitar. |
| Moonlight Sonata | Pedaled introductory piano; quieter string support; returning second theme develops in its original register with a lower harmony. |
| Carol of the Bells | Quieter high bell layer and strings, separate vowel-like choir, and a restrained final ostinato instead of another octave lift. |
| Korobeiniki | Lower chip and final lead registers; quieter chip arpeggios; final harmony becomes selective low octave punctuation. |
| Drunken Sailor | Fiddle break is now played by a fiddle in the player stem; less high doubling and less accordion/rhythm competition. |
| Greensleeves | Dry, darker plucked voices without compulsory electric chorus; restrained fiddle register and quieter percussion/bass. |
| The Irish Washerwoman | Faster fiddle articulation, lower accompaniment doubling, drier acoustic comping and quieter accordion. |
| Caprice No. 24 | Lower exposed violin and final harmony; reduced string bed/organ so the fast lead remains clear. |
| Glass Elevator | Almost-dry clean guitar with working bends, shorter funk articulation, quieter horns/organ, selective open hats. |
| Pocket Change | Shorter upstroke articulation, almost-dry clean guitar, darker/quieter horn stabs and less horn reverb. |
| Switchback Breakdown | Fiddle break moved to the playable stem, comping moved behind it; dry plucks, quieter bass/drone fiddle/banjo accompaniment. |
| Rust Belt Shuffle | Warmer lead, less room wash, quieter organ/rhythm guitar, lighter piano comping and phrase-shaped solo dynamics. |
| Low Orbit | Restored ninths in Gadd9 pad voicings; ride-led climax with fewer crashes; reduced pad/string wash while preserving the build. |
| Seventh Gear | Less duplicated rhythm guitar, lower returning counterline, quieter pad, and meter-aware phrase accents. |
| Afterglow Protocol | Lower electric piano and final harmony, less supersaw gain/brightness, less competing arpeggio and echo energy. |
| Sunday Tape | Lower solo and double-stop reprise; remove high bell duplication; quieter bass/guitar, softer hats, warmer clean tone. |
| Warehouse Current | Riff follows each chord’s third/seventh instead of repeating F-minor pitches over major/dominant chords; working organ filtering, quieter stabs and shorter groove articulation. |
| Photon Run | Pursuit arpeggios gain breathing gaps; final melody stays in register; quieter/darker brass and drier electric piano. |

## Shared sound and mix changes

- Clean guitar passes bend and optional vibrato into the string model. Chorus is configurable and
  can be disabled for folk/bluegrass passages. Lead vibrato is shallower and amp drive is reduced.
- Short string notes have a separate fast envelope. Fiddle attack scales down for fast notes.
  Five-oscillator string/pad detuning is now symmetric.
- Choir uses an independent additive vowel-like spectrum instead of aliasing the pad preset.
- Piano supports bounded per-note damper holds. This is a lightweight approximation, not a physical
  pedal/sympathetic-resonance simulation or a sampled concert grand.
- Cymbal oscillator sources are band-limited. Three deterministic hit variants reduce identical
  repeated drum attacks; a new closed/open hat chokes the previous open hat. Open hats take priority
  over simultaneous closed hits. Orchestral kick/snare use gentler synthesis parameters.
- A shared 5 ms lookahead gain envelope replaces instantaneous sample clipping. Both stems receive
  the same gain, and peeking at future samples introduces no timeline delay. The sample ceiling is
  0.7; full-song true peaks are separately checked with FFmpeg. This is not advertised as a formally
  guaranteed oversampled true-peak limiter.
- Normalize complete songs using EBU R128 integrated loudness. Default target is −16 LUFS,
  Gymnopédie/Greensleeves −18, and Low Orbit/Switchback −17. Keep phrase and section dynamics intact.
  Check every rendered master against −1 dBTP, and report encoded MP3 peaks separately.

## Measured full-song results

These measurements describe the final PCM mix before playback volume controls. MP3 peaks are also
checked after encoding; the actual game continues to synthesize PCM stems. Loudness range is preserved
within each arrangement; normalization is a single per-song trim, not section-by-section leveling.

| Track | Integrated LUFS | PCM true peak (dBTP) | MP3 true peak (dBTP) | Mean limiter gain reduction |
| --- | ---: | ---: | ---: | ---: |
| Gymnopédie No. 1 | -18.0 | -5.0 | -5.0 | 0.00% |
| Midnight Drive | -16.0 | -2.9 | -2.8 | 0.01% |
| Ignition | -16.0 | -5.7 | -5.8 | 0.00% |
| Neon Skyline | -16.0 | -3.0 | -2.9 | 0.02% |
| Canon in D | -16.0 | -5.8 | -5.4 | 0.00% |
| In the Hall of the Mountain King | -16.0 | -4.3 | -4.3 | 0.00% |
| Toccata and Fugue in D minor | -16.0 | -6.8 | -6.9 | 0.00% |
| Moonlight Sonata | -16.0 | -4.7 | -4.7 | 0.00% |
| Carol of the Bells | -15.8 | -6.9 | -6.8 | 0.00% |
| Korobeiniki | -16.0 | -4.7 | -4.9 | 0.00% |
| Drunken Sailor | -16.0 | -4.3 | -4.9 | 0.00% |
| Greensleeves | -17.8 | -3.0 | -3.0 | 0.03% |
| The Irish Washerwoman | -15.9 | -2.6 | -2.5 | 0.58% |
| Caprice No. 24 | -16.0 | -6.0 | -5.9 | 0.00% |
| Glass Elevator | -15.8 | -2.6 | -2.6 | 0.03% |
| Pocket Change | -16.0 | -4.4 | -4.5 | 0.00% |
| Switchback Breakdown | -16.8 | -2.6 | -2.4 | 0.07% |
| Rust Belt Shuffle | -16.0 | -5.9 | -5.9 | 0.00% |
| Low Orbit | -17.0 | -5.7 | -5.7 | 0.00% |
| Seventh Gear | -16.0 | -5.6 | -5.8 | 0.00% |
| Afterglow Protocol | -16.0 | -3.1 | -3.1 | 0.00% |
| Sunday Tape | -16.0 | -2.9 | -2.8 | 0.33% |
| Warehouse Current | -15.9 | -3.6 | -3.6 | 0.00% |
| Photon Run | -16.0 | -3.0 | -2.7 | 0.11% |

The independent full-song verification reproduced the 23 unchanged MP3 masters byte for byte.
Warehouse Current was then re-rendered and calibrated after its final harmonic revision. Every
individual PCM stem is below full scale; the highest measured stem peak is -1.8 dBFS. The full pack runs approximately 48 minutes.

## Reproduce and audition

Requires Node 24, the repository's locked development tools, and FFmpeg for audio measurement/encoding.

```sh
npm ci
npm test
npm run build
node tests/tools/starter-audio-audit.mjs --write --out /tmp/starter-review
```

Add `--before /path/to/baseline-checkout` to generate 24-second before/after excerpts at the same
musical preview point. Each pair is matched to the same integrated loudness with headroom, then faded
at its edges. The excerpts use matching musical positions even when a rework changes the tempo.
The output contains full MP3s, paired excerpts, `playlist.m3u`, and `measurements.json`. Generated audio
is not bundled into the game. The older `loudness.ts` command delegates to this perceptual audit so it
cannot accidentally restore RMS normalization.

Listening approval remains open. For every track, audition the entire arrangement and check exposed
attacks, register, kick/bass interaction, melody prominence, transitions, repetition fatigue, and endings.
Compare the matched excerpts on headphones and speakers, and verify mono compatibility. Measurements
and passing chart tests cannot establish musical satisfaction.

## Ten proposed original tracks

These are composition briefs, not implemented songs. Each should earn its place through a complete
arrangement and an auditioned demo before expanding the pack. Tempos below are quarter-note BPM.

| Working title | Style / tempo / key | Musical identity and arrangement | Playable focus |
| --- | --- | --- | --- |
| Copperwire | Garage rock · 112 · E minor | Four-note low riff, stop-time verse, open-chord chorus, short answering solo; dry and economical. | Accessible rests, accents and power chords; a stronger beginner rock entry. |
| Night Bus | Trip-hop · 92 · D minor | Spacious minor-ninth electric piano, swung break, muted guitar answers; drumless middle eight and restrained final return. | Syncopated stabs and melodic pauses rather than constant sixteenths. |
| Saltwater Signal | Surf rock · 148 · E minor | Tremolo-picked twang, descending minor line, contrasting major bridge, spring-like echo kept behind the attack. | Alternating picking and short melodic bends. |
| Relay Race | Liquid drum & bass · 170 · F minor | Evolving breakbeat, clean sub, warm electric-piano hook; halftime breakdown before the final break returns. | A clear hook against fast drums, with optional dense fills on Expert. |
| Paper Lanterns | Fingerstyle ballad · 108 · D major · 6/8 | Alternating bass, upper melody and suspended chords; intimate first verse, softly widened second verse, resolved ending. | Melody-over-bass coordination with forgiving early charts. |
| Fault Lines | Clean math rock · 128 · B minor | Interlocking guitar answers in 7/8 verses and a broad 4/4 chorus; rhythmic displacement instead of high-gain chugs. | Odd-meter groupings and call-and-response. |
| After Hours | Jazz-funk · 104 · D Dorian | Electric-piano motif, dry guitar scratches, mobile bass; short traded solos and a final ensemble stop. | Ghosted chords, offbeat accents and chord-tone solo phrases. |
| Porcelain Arcade | Chiptune waltz · 122 · C minor · 3/4 | A genuine pulse-wave trio with a singable two-bar theme, counterpoint in verse two, brighter relative-major bridge. | Three-beat phrasing, melody/countermelody hand-offs. |
| Blacktop Thunder | Southern rock · 96 · D mixolydian | Low open-string riff, roomy backbeat, bent-note answers, spacious halftime bridge and a compact twin-lead ending. | Sustains, bends, deliberate strums and occasional double stops. |
| Northern Lights | Indie disco · 118 · A major | Clean octave guitar, melodic bass and warm keys; chorus arrives through harmonic and rhythmic lift, not an octave-up supersaw. | Offbeat picking, octave shapes and a concise melodic solo. |
