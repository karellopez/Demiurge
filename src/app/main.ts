/**
 * Entry point. Starts the application, binds input, and reports any failure on
 * screen.
 *
 * @module
 */

import './styles.css';

import { bindInput } from './bindings';
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
  bindInput(started.value, globalThis);
} else {
  const message = describeBootFailure(started.error);
  console.error(message);

  const host = document.querySelector<HTMLElement>(MOUNT_SELECTOR) ?? document.body;
  const notice = document.createElement('p');
  notice.className = 'boot-failure';
  notice.textContent = message;
  host.replaceChildren(notice);
}
