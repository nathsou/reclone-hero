import type { SongDef } from '../score.ts';
import { canon } from './canon.ts';
import { fifth } from './fifth.ts';
import { forty } from './forty.ts';
import { furElise } from './furElise.ts';
import { ignition } from './ignition.ts';
import { midnightDrive } from './midnightDrive.ts';
import { minuet } from './minuet.ts';
import { mountainKing } from './mountainKing.ts';
import { nachtmusik } from './nachtmusik.ts';
import { neonSkyline } from './neonSkyline.ts';
import { odeToJoy } from './odeToJoy.ts';
import { preludeInC } from './preludeInC.ts';
import { redline } from './redline.ts';
import { toccata } from './toccata.ts';

/** The built-in songs, in the order they are listed. */
export const STARTER_SONGS: SongDef[] = [odeToJoy, ignition, midnightDrive, neonSkyline, furElise, canon, mountainKing, redline, fifth, nachtmusik, forty, toccata, preludeInC, minuet];
