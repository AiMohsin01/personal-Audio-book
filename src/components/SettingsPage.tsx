import { defaults, type Settings as Preferences } from "../model";

import { Heading } from "./shared";
export default function SettingsPage({
  settings: s,
  preferences: p,
}: {
  settings: Preferences;
  preferences: (p: Partial<Preferences>) => void;
}) {
  const number = (
    key: keyof Preferences,
    label: string,
    min: number,
    max: number,
    step = 1,
  ) => (
    <label className="field">
      {label}
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={s[key] as number}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v) && v >= min && v <= max) p({ [key]: v });
        }}
      />
    </label>
  );
  const reset = (keys: (keyof Preferences)[]) =>
    p(Object.fromEntries(keys.map((k) => [k, defaults[k]])));
  return (
    <>
      <Heading
        eyebrow="MAKE YOURSELF AT HOME"
        title="Settings"
        subtitle="Your space, your sound, your own way of listening."
      />
      <div className="settings-grid">
        <section className="panel">
          <div className="section-heading">
            <h3>Appearance</h3>
            <button
              onClick={() =>
                reset([
                  "theme",
                  "accent",
                  "background",
                  "font",
                  "fontSize",
                  "cardSize",
                  "coverSize",
                  "density",
                  "sidebar",
                  "playerCompact",
                ])
              }
            >
              Reset
            </button>
          </div>
          <label className="field">
            Theme
            <select
              value={s.theme}
              onChange={(e) => p({ theme: e.target.value as "light" | "dark" })}
            >
              <option>light</option>
              <option>dark</option>
            </select>
          </label>
          <label className="field">
            Accent color
            <input
              type="color"
              value={s.accent}
              onChange={(e) => p({ accent: e.target.value })}
            />
          </label>
          <label className="field">
            Background
            <input
              type="color"
              value={s.background}
              onChange={(e) => p({ background: e.target.value })}
            />
          </label>
          <label className="field">
            Interface font
            <select
              value={s.font}
              onChange={(e) => p({ font: e.target.value })}
            >
              <option>system-ui</option>
              <option>Georgia</option>
              <option>monospace</option>
            </select>
          </label>
          {number("fontSize", "Font size", 12, 24)}
          {number("cardSize", "Book card width", 130, 300)}
          {number("coverSize", "Cover height", 160, 360)}
          {number("density", "Layout spacing", 0.7, 1.4, 0.1)}
          <label className="check-field">
            <input
              type="checkbox"
              checked={s.sidebar}
              onChange={(e) => p({ sidebar: e.target.checked })}
            />
            Full-width sidebar
          </label>
          <label className="check-field">
            <input
              type="checkbox"
              checked={s.playerCompact}
              onChange={(e) => p({ playerCompact: e.target.checked })}
            />
            Compact player
          </label>
        </section>
        <section className="panel">
          <div className="section-heading">
            <h3>Playback & narration</h3>
            <button
              onClick={() =>
                reset([
                  "speed",
                  "skip",
                  "volume",
                  "rewind",
                  "silenceSkip",
                  "silenceThreshold",
                  "silenceWindow",
                  "autoResume",
                  "sleep",
                  "voice",
                ])
              }
            >
              Reset
            </button>
          </div>
          {number("speed", "Default playback / narration speed", 0.5, 3, 0.05)}
          {number("skip", "Skip interval (seconds)", 1, 180)}
          {number("volume", "Volume", 0, 1, 0.05)}
          {number("rewind", "Smart rewind after 10s pause (seconds)", 0, 60)}
          <label className="check-field">
            <input
              type="checkbox"
              checked={s.silenceSkip}
              onChange={(e) => p({ silenceSkip: e.target.checked })}
            />
            Skip detected silence (experimental)
          </label>
          {number(
            "silenceThreshold",
            "Silence RMS threshold",
            0.0001,
            0.05,
            0.0001,
          )}
          {number("silenceWindow", "Minimum silence (seconds)", 0.2, 3, 0.1)}
          <p className="muted">
            Detects actual signal energy using Web Audio. Pause and resume after
            enabling. Low-volume narration may be mistaken for silence; lower
            the threshold if speech is cut. Detection pauses while muted.
          </p>
          {number("sleep", "Default sleep timer (minutes, 0 = off)", 0, 180)}
          <label className="field">
            Default Piper voice ID
            <input
              value={s.voice}
              placeholder="en_US-lessac-medium"
              onChange={(e) => p({ voice: e.target.value })}
            />
          </label>
          <label className="check-field">
            <input
              type="checkbox"
              checked={s.autoResume}
              onChange={(e) => p({ autoResume: e.target.checked })}
            />
            Restore last book when opening (tap play to listen)
          </label>
          <p className="muted">
            Background and lock-screen controls depend on browser/OS support.
            Space: play/pause. Left/right: skip. Silence skipping is opt-in and
            may need tuning for quiet narration.
          </p>
        </section>
        <section className="panel">
          <div className="section-heading">
            <h3>Library & reading</h3>
            <button
              onClick={() =>
                reset([
                  "sort",
                  "goal",
                  "readerSize",
                  "readerFont",
                  "readerSpacing",
                  "readerTheme",
                ])
              }
            >
              Reset
            </button>
          </div>
          <label className="field">
            Default sorting
            <select
              value={s.sort}
              onChange={(e) => p({ sort: e.target.value })}
            >
              {[
                "added",
                "title",
                "author",
                "lastPlayed",
                "duration",
                "progress",
              ].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          {number("goal", "Daily listening goal (minutes)", 1, 1440)}
          {number("readerSize", "Reading font size", 14, 36)}
          {number("readerSpacing", "Reading line spacing", 1.2, 2.5, 0.1)}
          <label className="field">
            Reading font
            <select
              value={s.readerFont}
              onChange={(e) => p({ readerFont: e.target.value })}
            >
              <option>Georgia</option>
              <option>system-ui</option>
              <option>monospace</option>
            </select>
          </label>
          <p className="muted">
            Genres, metadata, covers, and collection membership can be edited on
            each book’s details page.
          </p>
        </section>
        <section className="panel">
          <div className="section-heading">
            <h3>Local processing</h3>
            <button onClick={() => reset(["companion"])}>Reset</button>
          </div>
          <label className="field">
            Companion URL
            <input
              value={s.companion}
              onChange={(e) => p({ companion: e.target.value })}
            />
          </label>
          <p className="notice">
            Use a loopback address on desktop. A phone needs a trusted LAN
            server with HTTPS and an explicitly allowed origin. Never expose the
            companion to the public internet. See README.
          </p>
          <h3>Private by design</h3>
          <p>
            No account, ads, tracking, subscriptions, or remote book storage.
            The only optional external request is an explicitly approved voice
            model download.
          </p>
        </section>
      </div>
    </>
  );
}
