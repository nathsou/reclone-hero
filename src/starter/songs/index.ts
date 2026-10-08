import type { SongDef } from '../score.ts';
import { LEVELS } from './levels.ts';
import { gymnopedie } from './gymnopedie.ts';
import { midnightDrive } from './midnightDrive.ts';
import { ignition } from './ignition.ts';
import { neonSkyline } from './neonSkyline.ts';
import { canon } from './canon.ts';
import { mountainKing } from './mountainKing.ts';
import { toccata } from './toccata.ts';
import { moonlight } from './moonlight.ts';
import { carolOfTheBells } from './carolOfTheBells.ts';
import { korobeiniki } from './korobeiniki.ts';
import { drunkenSailor } from './drunkenSailor.ts';
import { greensleeves } from './greensleeves.ts';
import { washerwoman } from './washerwoman.ts';
import { caprice24 } from './caprice24.ts';
import { glassElevator } from './glassElevator.ts';
import { pocketChange } from './pocketChange.ts';
import { switchback } from './switchback.ts';
import { rustBelt } from './rustBelt.ts';
import { lowOrbit } from './lowOrbit.ts';
import { seventhGear } from './seventhGear.ts';
import { afterglow } from './afterglow.ts';
import { sundayTape } from './sundayTape.ts';
import { warehouseCurrent, photonRun } from './robotSuite.ts';

/** Curated starter pack. Retired scores remain in git history. */
export const STARTER_SONGS: SongDef[] = [
  gymnopedie, midnightDrive, ignition, neonSkyline, canon, mountainKing, toccata, moonlight, carolOfTheBells, korobeiniki, drunkenSailor, greensleeves, washerwoman, caprice24, glassElevator, pocketChange, switchback, rustBelt, lowOrbit, seventhGear, afterglow, sundayTape, warehouseCurrent, photonRun
].map(s => ({ ...s, levelDb: LEVELS[s.id] ?? 0 }));
