import { Play, Pause, SkipBack, SkipForward, Volume2 } from "lucide-react";

import { time, type Settings as Preferences } from "../model";
import { type Player } from "../player";
export default function PlayerControls({
  player: p,
  settings: s,
  preferences,
}: {
  player: Player;
  settings: Preferences;
  preferences: (p: Partial<Preferences>) => void;
}) {
  return (
    <>
      <input
        className="full-progress"
        aria-label="Seek chapter"
        type="range"
        min="0"
        max={p.length || 1}
        step="0.1"
        value={Math.min(p.position, p.length || 1)}
        onChange={(e) => p.seek(Number(e.target.value))}
      />
      <div className="time-labels">
        <span>{time(p.position)}</span>
        <span>−{time((p.length - p.position) / s.speed)} remaining</span>
      </div>
      <div className="full-controls">
        <button
          aria-label="Previous chapter"
          onClick={() => p.changeChapter(-1)}
          style={{ display: "none" }}
        >
          <SkipBack />
        </button>
        <button
          aria-label={`Back ${s.skip} seconds`}
          onClick={() => p.skip(-s.skip)}
        >
          <SkipBack size={25} />
          <small>{s.skip}s</small>
        </button>
        <button
          className="play-button"
          aria-label={p.playing ? "Pause audiobook" : "Play audiobook"}
          onClick={p.toggle}
        >
          {p.playing ? <Pause size={28} /> : <Play size={28} />}
        </button>
        <button
          aria-label={`Forward ${s.skip} seconds`}
          onClick={() => p.skip(s.skip)}
        >
          <SkipForward size={25} />
          <small>{s.skip}s</small>
        </button>
      </div>
      <div className="player-sliders">
        <label>
          Speed
          <select
            value={s.speed}
            onChange={(e) => preferences({ speed: Number(e.target.value) })}
          >
            {[0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3].map((v) => (
              <option key={v} value={v}>
                {v}×
              </option>
            ))}
          </select>
        </label>
        <label>
          <Volume2 size={18} />
          <input
            aria-label="Player volume"
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={s.volume}
            onChange={(e) => preferences({ volume: Number(e.target.value) })}
          />
        </label>
      </div>
    </>
  );
}
