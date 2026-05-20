import { makePen } from './pen';
import { eraser } from './eraser';
import { hand } from './hand';
import { makeLineTool } from './line';
import { fib } from './fib';
import { region } from './region';
import { ellipse } from './ellipse';
import { arrow } from './arrow';
import { text } from './text';
import { snip } from './snip';
import type { Tool } from './types';
import type { ToolId } from '../../../shared/types';

export function buildRegistry(): Record<ToolId, Tool> {
  return {
    pencil: makePen('pencil'),
    pen: makePen('pen'),
    highlighter: makePen('highlighter'),
    eraser,
    hand,
    line: makeLineTool('horizontal'),
    trendline: makeLineTool('trendline'),
    fib,
    region,
    ellipse,
    arrow,
    text,
    snip,
  };
}
