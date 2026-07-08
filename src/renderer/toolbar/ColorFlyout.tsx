import { For, Show } from 'solid-js';
import { COLOR_PRESETS, SHAPE_WIDTH_TOOLS, THICKNESS_PRESETS } from '../../shared/constants';
import type { ToolId } from '../../shared/types';

type PresetKey = keyof typeof THICKNESS_PRESETS;
// Which preset row applies to the active tool: draw tools have their
// own; the stroked shapes share the thin 'shape' scale.
function presetKey(t: ToolId): PresetKey | null {
  if (t in THICKNESS_PRESETS) return t as PresetKey;
  if (SHAPE_WIDTH_TOOLS.has(t)) return 'shape';
  return null;
}

interface Props {
  color: string;
  width: number;
  tool: ToolId;
  onColor: (c: string) => void;
  onWidth: (n: number) => void;
}

// Contents of the 'color' flyout: the full palette + custom picker,
// and — when the active tool has per-tool thickness — a row of
// thickness chips. Reuses the app-wide .swatch / .hex-pick /
// .thickness-chip styles.
export function ColorFlyout(props: Props) {
  return (
    <div class="color-flyout">
      <div class="cf-swatches">
        <For each={COLOR_PRESETS}>
          {(c) => (
            <button
              type="button"
              class={`swatch ${props.color.toLowerCase() === c.toLowerCase() ? 'active' : ''}`}
              style={{ background: c }}
              onClick={() => props.onColor(c)}
              title={c.toUpperCase()}
              aria-label={`Color ${c.toUpperCase()}`}
            />
          )}
        </For>
        <label class="hex-pick" title="Custom color">
          <input
            type="color"
            value={props.color}
            onInput={(e) => props.onColor((e.currentTarget as HTMLInputElement).value)}
            aria-label="Custom color"
          />
          <span class="hex-glyph">+</span>
        </label>
      </div>
      <Show when={presetKey(props.tool)}>
        <div class="cf-thickness">
          <For each={THICKNESS_PRESETS[presetKey(props.tool)!].slice(0, 4)}>
            {(w) => (
              <button
                class={`thickness-chip ${props.width === w ? 'active' : ''}`}
                onClick={() => props.onWidth(w)}
                title={`${w}px`}
                aria-label={`${w} pixels`}
              >
                <span
                  class="thickness-chip-dot"
                  style={{
                    width: `${Math.min(w, 20)}px`,
                    height: `${Math.min(w, 20)}px`,
                    background:
                      props.tool === 'eraser' || props.tool === 'pencil'
                        ? 'var(--text)'
                        : props.color,
                    opacity: props.tool === 'highlighter' ? 0.55 : 1,
                  }}
                />
              </button>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}
