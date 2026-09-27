import { decodeText } from '../util/text.ts';
import { buildChart } from './build.ts';
import type { Chart } from './build.ts';
import { parseDotChart } from './dotchart.ts';
import { parseMidiChart } from './midichart.ts';
import type { ChartOptions } from './types.ts';

export function loadChart(fileName: string, bytes: Uint8Array, opts: ChartOptions = {}): Chart {
  const raw = /\.mid$/i.test(fileName) ? parseMidiChart(bytes, opts.multiplierNote) : parseDotChart(decodeText(bytes));
  return buildChart(raw, opts);
}
