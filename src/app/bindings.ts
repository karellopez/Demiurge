/**
 * Keyboard and pointer bindings.
 *
 * Every key here is a placeholder for a remappable one: the brief requires full
 * rebinding, and that arrives with the settings screen in phase 11. What matters
 * now is that the *actions* are named and routed through one place, so rebinding
 * later is a change to a table rather than a hunt through event handlers.
 *
 * @module
 */

import { SCALE_PRESETS } from '@domain/scale';
import {
  DEFAULT_TIME_SCALE_INDEX,
  INITIAL_TIME_SCALE,
  faster,
  reversed,
  slower,
  togglePause,
  type TimeScaleState,
} from '@domain/time-scale';

import type { RunningApplication } from './composition-root';

/** How far a pixel of mouse drag turns the camera, in radians. */
const DRAG_SENSITIVITY = 0.005;

/** Wheel delta that counts as one zoom notch. */
const WHEEL_NOTCH = 100;

/** The mutable state the bindings own between events. */
interface BindingState {
  timeScale: TimeScaleState;
  resumeTo: number;
  isDragging: boolean;
}

/**
 * Handles the keys that change what is on screen.
 *
 * These are separated from the time keys because they touch different parts of
 * the application and because keeping each table short is what keeps either one
 * readable at a glance.
 *
 * @param key - The key that was pressed.
 * @param application - The running application to act on.
 * @returns True when the key was handled.
 */
function isViewKey(key: string, application: RunningApplication): boolean {
  switch (key) {
    case 'F3': {
      application.stats.toggle();
      return true;
    }
    case 'c':
    case 'C': {
      application.scene?.rig.cycleMode();
      return true;
    }
    default: {
      return isScaleKey(key, application);
    }
  }
}

/**
 * Handles the keys that change which body is followed.
 *
 * The brackets walk the catalogue in tree order, which is the same order the
 * list shows, so the two never disagree about what "next" means.
 *
 * @param key - The key that was pressed.
 * @param application - The running application to act on.
 * @returns True when the key was handled.
 */
function isBodyKey(key: string, application: RunningApplication): boolean {
  switch (key) {
    case 'b':
    case 'B': {
      application.browser.toggle();
      return true;
    }
    case '[': {
      application.scene?.rig.cycleBody(-1);
      return true;
    }
    case ']': {
      application.scene?.rig.cycleBody(1);
      return true;
    }
    default: {
      return false;
    }
  }
}

/**
 * Handles the number row, which selects a scale preset.
 *
 * @param key - The key that was pressed.
 * @param application - The running application to act on.
 * @returns True when the key named a preset.
 */
function isScaleKey(key: string, application: RunningApplication): boolean {
  const index = Number(key) - 1;
  if (!Number.isSafeInteger(index)) {
    return false;
  }
  const preset = SCALE_PRESETS[index];
  if (preset === undefined) {
    return false;
  }
  application.setScale(preset.settings);
  return true;
}

/**
 * Handles the keys that change how fast time runs.
 *
 * @param key - The key that was pressed.
 * @param application - The running application to act on.
 * @param state - The bindings' own state, advanced in place.
 * @returns True when the key was handled.
 */
function isTimeKey(key: string, application: RunningApplication, state: BindingState): boolean {
  const apply = (next: TimeScaleState): void => {
    state.timeScale = next;
    application.setTimeScale(next);
  };

  switch (key) {
    case '.': {
      apply(faster(state.timeScale));
      return true;
    }
    case ',': {
      apply(slower(state.timeScale));
      return true;
    }
    case 'r':
    case 'R': {
      apply(reversed(state.timeScale));
      return true;
    }
    case 'p':
    case 'P': {
      // Remember the rung, so unpausing does not cost the player their place on
      // a nine-decade ladder.
      if (state.timeScale.index !== 0) {
        state.resumeTo = state.timeScale.index;
      }
      apply(togglePause(state.timeScale, state.resumeTo));
      return true;
    }
    default: {
      return false;
    }
  }
}

/**
 * Binds the mouse: drag to orbit, wheel to zoom.
 *
 * Both are restricted to the canvas. A drag that starts on the body list is a
 * selection, and a wheel over a scrolling panel belongs to the panel.
 *
 * @param application - The application to drive.
 * @param target - The event target to listen on.
 * @param state - The bindings' own state, advanced in place.
 */
function bindPointer(
  application: RunningApplication,
  target: EventTarget,
  state: BindingState,
): void {
  target.addEventListener('pointerdown', (event) => {
    if ((event as PointerEvent).target instanceof HTMLCanvasElement) {
      state.isDragging = true;
    }
  });

  target.addEventListener('pointerup', () => {
    state.isDragging = false;
  });

  target.addEventListener('pointermove', (event) => {
    if (!state.isDragging) {
      return;
    }
    const pointerEvent = event as PointerEvent;
    application.scene?.rig.orbitBy(
      -pointerEvent.movementX * DRAG_SENSITIVITY,
      pointerEvent.movementY * DRAG_SENSITIVITY,
    );
  });

  target.addEventListener(
    'wheel',
    (event) => {
      const wheelEvent = event as WheelEvent;
      if (!(wheelEvent.target instanceof HTMLCanvasElement)) {
        return;
      }
      wheelEvent.preventDefault();
      application.scene?.rig.zoom(wheelEvent.deltaY / WHEEL_NOTCH);
    },
    { passive: false },
  );
}

/**
 * Binds keyboard and pointer input to a running application.
 *
 * @param application - The application to drive.
 * @param target - The event target to listen on. The window, in production.
 */
export function bindInput(application: RunningApplication, target: EventTarget): void {
  const state: BindingState = {
    timeScale: INITIAL_TIME_SCALE,
    resumeTo: DEFAULT_TIME_SCALE_INDEX,
    isDragging: false,
  };

  // The title screen is a curtain, not a gate: the first input of any kind
  // clears it, and that same input still does whatever it was going to do.
  const dismiss = (): void => {
    application.dismissTitleScreen();
  };
  target.addEventListener('keydown', dismiss, { once: true });
  target.addEventListener('pointerdown', dismiss, { once: true });

  target.addEventListener('keydown', (event) => {
    const keyboardEvent = event as KeyboardEvent;
    // Typing a body name into the search box must not warp time.
    if (keyboardEvent.target instanceof HTMLInputElement) {
      return;
    }
    const key = keyboardEvent.key;
    if (
      isViewKey(key, application) ||
      isBodyKey(key, application) ||
      isTimeKey(key, application, state)
    ) {
      keyboardEvent.preventDefault();
    }
  });

  bindPointer(application, target, state);
}
