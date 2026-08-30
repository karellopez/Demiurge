/**
 * Entry point. Starts the application and reports any failure on screen.
 *
 * @module
 */

import './styles.css';

import { describeBootFailure, readSeedFromHash, startApplication } from './composition-root';

const MOUNT_SELECTOR = '#app';

const started = startApplication({
  mountSelector: MOUNT_SELECTOR,
  requestedSeed: readSeedFromHash(location.hash),
  startRenderLoop: true,
});

if (started.ok) {
  const application = started.value;
  addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.key !== 'F3') {
      return;
    }

    event.preventDefault();
    application.stats.toggle();
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
