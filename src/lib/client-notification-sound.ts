"use client";

let sharedAudioContext: AudioContext | null = null;

function getAudioContext() {
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextCtor) return null;
  sharedAudioContext ??= new AudioContextCtor();
  return sharedAudioContext;
}

export async function playNotificationSound(volume = 0.6) {
  const audioPlayed = await playAudioFile(volume);
  const beepPlayed = await playBeep(volume);
  return audioPlayed || beepPlayed;
}

export async function unlockNotificationSound() {
  const context = getAudioContext();
  if (context?.state === "suspended") {
    await context.resume().catch(() => undefined);
  }
  return playBeep(0.02, 60);
}

async function playAudioFile(volume: number) {
  try {
    const audio = new Audio("/sounds/notification.wav");
    audio.preload = "auto";
    audio.volume = volume;
    await audio.play();
    return true;
  } catch {
    return false;
  }
}

async function playBeep(volume: number, durationMs = 520) {
  try {
    const context = getAudioContext();
    if (!context) return false;
    if (context.state === "suspended") {
      await context.resume();
    }

    const now = context.currentTime;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume), now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + durationMs / 1000);
    gain.connect(context.destination);

    const first = context.createOscillator();
    first.type = "sine";
    first.frequency.setValueAtTime(880, now);
    first.connect(gain);
    first.start(now);
    first.stop(now + durationMs / 1000);

    const second = context.createOscillator();
    second.type = "sine";
    second.frequency.setValueAtTime(1320, now + 0.12);
    second.connect(gain);
    second.start(now + 0.12);
    second.stop(now + durationMs / 1000);

    return true;
  } catch {
    return false;
  }
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}
