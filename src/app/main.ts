/**
 * Entry point. Starts the application, binds the keyboard, and reports any
 * failure on screen.
 *
 * @module
 */

import './styles.css';

import {
  DEFAULT_TIME_SCALE_INDEX,
  INITIAL_TIME_SCALE,
  faster,
  reversed,
  slower,
  togglePause,
  type TimeScaleState,
} from '@domain/time-scale';

import { describeBootFailure } from './boot-failure';
import { startApplication } from './composition-root';
import { readSeedFromHash } from './session-url';

const MOUNT_SELECTOR = '#app';

const started = startApplication({
  mountSelector: MOUNT_SELECTOR,
  requestedSeed: readSeedFromHash(location.hash),
  startRenderLoop: true,
});

if (started.ok) {
  const application = started.value;

  let timeScale: TimeScaleState = INITIAL_TIME_SCALE;
  let resumeTo = DEFAULT_TIME_SCALE_INDEX;

  /**
   * Applies a new time-warp setting.
   *
   * @param next - The state to move to.
   */
  const apply = (next: TimeScaleState): void => {
    timeScale = next;
    application.setTimeScale(next);
  };

  const dismissTitle = (): void => {
    application.dismissTitleScreen();
  };
  addEventListener('keydown', dismissTitle, { once: true });
  addEventListener('pointerdown', dismissTitle, { once: true });

  addEventListener('keydown', (event: KeyboardEvent) => {
    switch (event.key) {
      case 'F3': {
        event.preventDefault();
        application.stats.toggle();
        break;
      }
      case '.': {
        apply(faster(timeScale));
        break;
      }
      case ',': {
        apply(slower(timeScale));
        break;
      }
      case 'r':
      case 'R': {
        apply(reversed(timeScale));
        break;
      }
      case 'p':
      case 'P': {
        // Remember where the ladder was, so unpausing does not cost the player
        // their place on a nine-decade scale.
        if (timeScale.index !== 0) {
          resumeTo = timeScale.index;
        }
        apply(togglePause(timeScale, resumeTo));
        break;
      }
      default: {
        break;
      }
    }
  });
} else {
  const message = describeBootFailure(started.error);
  console.error(message);

  const host = document.querySelector<HTMLElement>(MOUNT_SELECTOR) ?? document.body;
  const notice = document.createElement('p');
  notice.className = 'boot-failure';
  notice.textContent = message;
  host.replaceChildren(notice);
}
