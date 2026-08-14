import { unitType } from '../model/units';
import type { UnitTypeId } from '../model/types';

/**
 * Sound.
 *
 * Everything here degrades to silence: a missing file, a browser that refuses
 * to autoplay, a machine with no audio device — none of it should ever break
 * the game or throw into the turn loop.
 *
 * Filenames are mapped here rather than renamed on disk, so the credited
 * original names stay intact for the licence trail.
 */

export type SfxId =
  | 'melee'
  | 'sword'
  | 'arrow'
  | 'arrow-hit'
  | 'axe-throw'
  | 'magic'
  | 'magic-dark'
  | 'holy'
  | 'siege'
  | 'dragon'
  | 'roar-troll'
  | 'roar-ogre'
  | 'grunt-small'
  | 'grunt-human'
  | 'grunt-knight'
  | 'grunt-female'
  | 'death-monster'
  | 'death-goblin'
  | 'cry'
  | 'grunt-beast';

const SFX_FILES: Record<SfxId, string> = {
  melee: 'daviddumaisaudio-monster-05-grunt-and-growl-195715.mp3',
  sword: 'dragon-studio-sword-clashhit-393837.mp3',
  arrow: 'djartmusic-arrow-swish_03-306040.mp3',
  'arrow-hit': 'dennish18-arrow-body-impact-146419.mp3',
  'axe-throw': 'soundreality-whoosh-axe-throw-389751.mp3',
  magic: 'djartmusic-magical-sparkle-whoosh-298750.mp3',
  'magic-dark': 'yodguard-casting-magic-4-382380.mp3',
  holy: 'coghezzi-holy-healing-spell-533279.mp3',
  siege: 'adhimahadi-ballista-slow-mo-8280.mp3',
  dragon: 'dragon-studio-dragon-breathing-fire-364475.mp3',
  'roar-troll': 'freesound_community-troll-roars-100312.mp3',
  'roar-ogre': 'magiaz-ogre-387362.mp3',
  'grunt-small': 'daviddumaisaudio-small-monster-attack-195712.mp3',
  'grunt-human': 'phatphrogstudio-male-fighter-voice-heavy-attack-grunt-544355.mp3',
  'grunt-knight': 'phatphrogstudio-rpg-m-knight-voice-attack-grunt-490291.mp3',
  'grunt-female': 'phatphrogstudio-rpg-female-attack-grunt-no-ai-481720.mp3',
  'death-monster': '666herohero-monster-death-grunt-131480.mp3',
  'death-goblin': 'freesound_community-goblin-death-6729.mp3',
  cry: 'freesound_community-gryffin-cry-6995.mp3',
  'grunt-beast': 'dragon-studio-deer-grunt-472371.mp3',
};

/** What each creature sounds like when it attacks, and when it dies. */
const CREATURE_VOICE: Record<string, { attack: SfxId; death: SfxId }> = {
  peon: { attack: 'grunt-small', death: 'death-goblin' },
  goblin: { attack: 'grunt-small', death: 'death-goblin' },
  sapper: { attack: 'siege', death: 'death-goblin' },
  orc: { attack: 'melee', death: 'death-monster' },
  axethrower: { attack: 'axe-throw', death: 'death-monster' },
  troll: { attack: 'roar-troll', death: 'death-monster' },
  ogre: { attack: 'roar-ogre', death: 'death-monster' },
  deathknight: { attack: 'magic-dark', death: 'death-monster' },
  dragon: { attack: 'dragon', death: 'cry' },
  peasant: { attack: 'grunt-beast', death: 'grunt-female' },
  footman: { attack: 'grunt-human', death: 'grunt-human' },
  outrider: { attack: 'grunt-female', death: 'grunt-female' },
  archer: { attack: 'arrow', death: 'grunt-female' },
  knight: { attack: 'grunt-knight', death: 'grunt-human' },
  ballista: { attack: 'siege', death: 'sword' },
  mage: { attack: 'magic', death: 'grunt-human' },
  paladin: { attack: 'holy', death: 'grunt-knight' },
};

export type MusicTrack = 'world' | 'battle' | 'victory';

const MUSIC_FILES: Record<MusicTrack, string> = {
  world: 'world.mp3',
  battle: 'battle.mp3',
  victory: 'victory.mp3',
};

/** How long one track takes to give way to another. */
const MUSIC_FADE_MS = 1400;

const STORAGE_KEY = 'orcs-and-order:audio';

interface AudioPrefs {
  muted: boolean;
  sfxVolume: number;
  musicVolume: number;
}

const DEFAULTS: AudioPrefs = { muted: false, sfxVolume: 0.7, musicVolume: 0.35 };

export class AudioManager {
  private prefs: AudioPrefs = { ...DEFAULTS };
  private pool = new Map<SfxId, HTMLAudioElement[]>();
  private music: HTMLAudioElement | null = null;
  private currentTrack: MusicTrack | null = null;
  private fadeTimer: number | null = null;
  /** Browsers refuse to play anything until the user has interacted. */
  private unlocked = false;
  private pendingTrack: MusicTrack | null = null;
  private readonly base: string;
  /** Rapid identical sounds are dropped rather than stacking into a wall. */
  private lastPlayed = new Map<SfxId, number>();

  constructor(baseUrl: string = import.meta.env.BASE_URL) {
    this.base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
    this.load();
  }

  // --------------------------------------------------------------- prefs

  private load(): void {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) this.prefs = { ...DEFAULTS, ...(JSON.parse(raw) as Partial<AudioPrefs>) };
    } catch {
      // No storage, or nonsense in it. Defaults are fine.
    }
  }

  private save(): void {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.prefs));
    } catch {
      // Not worth caring about.
    }
  }

  get muted(): boolean {
    return this.prefs.muted;
  }

  toggleMute(): boolean {
    this.prefs.muted = !this.prefs.muted;
    this.save();
    if (this.music) {
      if (this.prefs.muted) this.music.pause();
      else void this.music.play().catch(() => {});
    }
    return this.prefs.muted;
  }

  setMusicVolume(v: number): void {
    this.prefs.musicVolume = Math.min(1, Math.max(0, v));
    if (this.music) this.music.volume = this.prefs.musicVolume;
    this.save();
  }

  setSfxVolume(v: number): void {
    this.prefs.sfxVolume = Math.min(1, Math.max(0, v));
    this.save();
  }

  get musicVolume(): number {
    return this.prefs.musicVolume;
  }

  get sfxVolume(): number {
    return this.prefs.sfxVolume;
  }

  /**
   * Called from the first real click or keypress. Until this happens, browsers
   * silently reject playback, so any music asked for early is queued.
   */
  unlock(): void {
    if (this.unlocked) return;
    this.unlocked = true;
    if (this.pendingTrack) {
      const track = this.pendingTrack;
      this.pendingTrack = null;
      this.playMusic(track);
    }
  }

  // ----------------------------------------------------------------- sfx

  play(id: SfxId, throttleMs = 90): void {
    if (this.prefs.muted || !this.unlocked) return;
    const now = performance.now();
    const last = this.lastPlayed.get(id) ?? -Infinity;
    if (now - last < throttleMs) return;
    this.lastPlayed.set(id, now);

    // A small pool per sound lets two overlap without cutting each other off.
    let voices = this.pool.get(id);
    if (!voices) {
      voices = Array.from({ length: 3 }, () => {
        const a = new Audio(`${this.base}sfx/${SFX_FILES[id]}`);
        a.preload = 'auto';
        return a;
      });
      this.pool.set(id, voices);
    }
    const free = voices.find((a) => a.paused || a.ended) ?? voices[0];
    free.currentTime = 0;
    free.volume = this.prefs.sfxVolume;
    void free.play().catch(() => {});
  }

  /** The right noise for a specific unit doing a specific thing. */
  playForUnit(typeId: UnitTypeId, kind: 'attack' | 'death'): void {
    const voice = CREATURE_VOICE[unitType(typeId).base];
    if (voice) this.play(voice[kind]);
  }

  // --------------------------------------------------------------- music

  get track(): MusicTrack | null {
    return this.currentTrack;
  }

  playMusic(track: MusicTrack): void {
    if (!this.unlocked) {
      this.pendingTrack = track;
      return;
    }
    if (this.currentTrack === track && this.music && !this.music.paused) return;
    this.currentTrack = track;

    const previous = this.music;
    const audio = new Audio(`${this.base}music/${MUSIC_FILES[track]}`);
    audio.loop = track !== 'victory';
    // Start silent and fade up; set here too so unmuting mid-track is correct.
    audio.volume = this.prefs.muted ? this.prefs.musicVolume : 0;
    this.music = audio;

    if (this.prefs.muted) {
      previous?.pause();
      return;
    }
    // A missing music file is fine; the game simply plays without it.
    void audio
      .play()
      .then(() => this.crossfade(previous, audio))
      .catch(() => previous?.pause());
  }

  /**
   * Fade one track out as the next fades in.
   *
   * Cutting straight from the world theme to the battle theme the instant a
   * scout crests a hill is jarring, and the switch happens often enough that it
   * would grate. The target is read from preferences on every tick, so dragging
   * the volume slider mid-fade behaves sensibly.
   */
  private crossfade(from: HTMLAudioElement | null, to: HTMLAudioElement): void {
    if (this.fadeTimer !== null) window.clearInterval(this.fadeTimer);
    const steps = 24;
    let step = 0;
    this.fadeTimer = window.setInterval(() => {
      step++;
      const t = Math.min(1, step / steps);
      const target = this.prefs.muted ? 0 : this.prefs.musicVolume;
      to.volume = target * t;
      if (from) from.volume = Math.max(0, target * (1 - t));
      if (t >= 1) {
        if (this.fadeTimer !== null) window.clearInterval(this.fadeTimer);
        this.fadeTimer = null;
        from?.pause();
      }
    }, MUSIC_FADE_MS / steps);
  }

  stopMusic(): void {
    if (this.fadeTimer !== null) window.clearInterval(this.fadeTimer);
    this.fadeTimer = null;
    this.music?.pause();
    this.music = null;
    this.currentTrack = null;
  }
}

export const audio = new AudioManager();
