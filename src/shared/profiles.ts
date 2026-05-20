import type { ProfileId, ToolId } from './types';

export interface Profile {
  id: ProfileId;
  label: string;
  description: string;
  tools: ToolId[];
}

export const PROFILES: Record<ProfileId, Profile> = {
  general: {
    id: 'general',
    label: 'General',
    description: 'Everyday annotations — simple & common',
    tools: ['pencil', 'pen', 'eraser', 'hand', 'line', 'arrow', 'text', 'region', 'ellipse', 'snip'],
  },
  teacher: {
    id: 'teacher',
    label: 'Teacher',
    description: 'Online teaching & presentations',
    tools: [
      'pencil',
      'pen',
      'highlighter',
      'eraser',
      'hand',
      'line',
      'arrow',
      'text',
      'region',
      'ellipse',
      'snip',
    ],
  },
  trader: {
    id: 'trader',
    label: 'Trader',
    description: 'Chart analysis & journaling',
    tools: [
      'pen',
      'pencil',
      'eraser',
      'hand',
      'line',
      'trendline',
      'fib',
      'region',
      'arrow',
      'text',
      'snip',
    ],
  },
};

export const DEFAULT_PROFILE: ProfileId = 'general';

export const PROFILE_ORDER: ProfileId[] = ['general', 'teacher', 'trader'];
