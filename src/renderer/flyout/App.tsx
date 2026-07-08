import { createEffect, createSignal, For, onCleanup, onMount, Show } from 'solid-js';
import { groupToolsForProfile } from '../../shared/toolGroups';
import type {
  FlyoutId,
  GroupId,
  ProfileId,
  Theme,
  ToolId,
  ToolSettings,
} from '../../shared/types';
import { ToolButton } from '../toolbar/ToolButton';
import { ColorFlyout } from '../toolbar/ColorFlyout';
import { TOOL_BY_ID, toolHint } from '../toolbar/toolDefs';

// The slice of hub state this window cares about.
interface Snapshot {
  flyout: FlyoutId | null;
  activeTool: ToolId;
  settings: ToolSettings;
  theme: Theme;
  profile: ProfileId;
}

const GROUP_LABELS: Record<GroupId, string> = { draw: 'Drawing tools', shapes: 'Shapes' };

// The flyout child window's page: renders the open flyout's card and
// nothing else. Living in its own always-on-top window means opening a
// submenu never touches the toolbar window's bounds — the bar stays
// perfectly still while the card pops in beside it. Main sizes this
// window to the exact card dimensions we report via flyout.setSize.
export function FlyoutWindowApp() {
  const [hub, setHub] = createSignal<Snapshot | null>(null);
  let cardEl: HTMLDivElement | undefined;

  onMount(() => {
    void window.pen.hub.get().then((s) => setHub(s as Snapshot));
    const off = window.pen.hub.onBroadcast((s) => setHub(s as Snapshot));
    onCleanup(off);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') void window.pen.hub.update({ flyout: null });
    };
    window.addEventListener('keydown', onKey);
    onCleanup(() => window.removeEventListener('keydown', onKey));
  });

  // Report the rendered card size so main can fit + place the window.
  // Runs after every render of the card (flyout id, profile, or tool
  // changes can all alter its dimensions).
  createEffect(() => {
    const s = hub();
    if (!s || s.flyout === null) return;
    // Track everything that can change the card's size.
    void s.profile;
    void s.activeTool;
    requestAnimationFrame(() => {
      if (!cardEl) return;
      void window.pen.flyout.setSize({
        w: Math.ceil(cardEl.offsetWidth),
        h: Math.ceil(cardEl.offsetHeight),
      });
    });
  });

  const setTool = (id: ToolId) =>
    void window.pen.hub.update({ activeTool: id, drawMode: true, flyout: null });
  const setColor = (c: string) => void window.pen.hub.update({ settings: { color: c } });
  const setWidth = (n: number) => void window.pen.hub.update({ settings: { width: n } });

  return (
    <Show when={hub()?.flyout} keyed>
      {(fid) => {
        const s = hub()!;
        return (
          <div class="bar flyout-window" data-theme={s.theme}>
            <div
              ref={cardEl}
              class="flyout-card is-window"
              role="menu"
              aria-label={fid === 'color' ? 'Color and thickness' : GROUP_LABELS[fid as GroupId]}
            >
              <Show
                when={fid === 'color'}
                fallback={
                  <For each={groupToolsForProfile(fid as GroupId, s.profile)}>
                    {(t) => (
                      <ToolButton
                        active={hub()!.activeTool === t}
                        title={`${TOOL_BY_ID[t].label} · ${toolHint(TOOL_BY_ID[t].hint)}`}
                        label={TOOL_BY_ID[t].label}
                        onClick={() => setTool(t)}
                      >{TOOL_BY_ID[t].icon()}</ToolButton>
                    )}
                  </For>
                }
              >
                <ColorFlyout
                  color={hub()!.settings.color}
                  width={hub()!.settings.width}
                  tool={hub()!.activeTool}
                  onColor={setColor}
                  onWidth={setWidth}
                />
              </Show>
            </div>
          </div>
        );
      }}
    </Show>
  );
}
