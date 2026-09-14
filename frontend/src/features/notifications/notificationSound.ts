/**
 * The notification chime, synthesized with the Web Audio API.
 *
 * Generated rather than shipped as a file: two short sine notes a fifth apart, rising —
 * the soft "something moved forward" cue a work update wants, not the urgency of an alarm.
 * No asset to load, cache or license, and the envelope keeps it quiet and click-free.
 *
 * Browsers only allow audio after the person has interacted with the page, so the context
 * is created lazily and resumed on the first pointer or key press; a chime that arrives
 * before that is silently skipped rather than queued.
 */

const MUTE_KEY = 'kanban:notification-sound-muted';
/** Several entries from one save (a transfer plus an edit) should still sound once. */
const MIN_GAP_MS = 1500;

let context: AudioContext | null = null;
let lastPlayedAt = 0;

function audioContext(): AudioContext | null {
  if (context) {
    return context;
  }
  const Constructor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Constructor) {
    return null;
  }
  context = new Constructor();
  return context;
}

/** Call once at startup: unlocks audio on the first real interaction with the page. */
export function primeNotificationSound(): () => void {
  const unlock = () => {
    const ctx = audioContext();
    void ctx?.resume().catch(() => undefined);
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
  return unlock;
}

export function isNotificationSoundMuted(): boolean {
  try {
    return window.localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

export function setNotificationSoundMuted(muted: boolean): void {
  try {
    window.localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
  } catch {
    // Nothing to persist to; the choice lasts for this page only.
  }
}

export function playNotificationSound(): void {
  if (isNotificationSoundMuted()) {
    return;
  }
  const now = Date.now();
  if (now - lastPlayedAt < MIN_GAP_MS) {
    return;
  }
  const ctx = audioContext();
  if (!ctx || ctx.state !== 'running') {
    return;
  }
  lastPlayedAt = now;

  const master = ctx.createGain();
  master.gain.value = 0.18;
  master.connect(ctx.destination);

  // A5 then E6: an ascending perfect fifth.
  [
    { frequency: 880, delay: 0 },
    { frequency: 1318.51, delay: 0.11 },
  ].forEach(({ frequency, delay }) => {
    const start = ctx.currentTime + delay;
    const oscillator = ctx.createOscillator();
    const envelope = ctx.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, start);
    // Fast attack, exponential decay: a bell-like "ding" with no click at either end.
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(1, start + 0.012);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + 0.42);
    oscillator.connect(envelope);
    envelope.connect(master);
    oscillator.start(start);
    oscillator.stop(start + 0.45);
  });
}
