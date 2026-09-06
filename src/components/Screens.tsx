"use client";

import type { Snapshot } from "@/src/game/core/Store";
import type { Game } from "@/src/game/Game";
import { mission1 } from "@/src/game/data/mission1";
import Image from "next/image";
import ControlsOverlay from "./ControlsOverlay";

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${r.toString().padStart(2, "0")}`;
}

export default function Screens({ snap, game, error }: { snap: Snapshot; game: Game | null; error: string | null }) {
  const backendBadge = snap.backend && (
    <div className={`backend ${snap.backend}`}>{snap.backend === "webgpu" ? "WebGPU" : "WebGL 2 fallback: WebGPU is not available in this browser"}</div>
  );

  if (error) {
    return (
      <div className="screen splash">
        <div className="card menu-card">
          <h1 className="logo">
            <Image src="/logo.webp" alt="Thunder Strike" width={1400} height={525} priority unoptimized />
          </h1>
          <p className="error">The renderer failed to start.</p>
          <pre className="error-detail">{error}</pre>
          <p className="muted">Try a current Chrome, Edge or Safari, and make sure hardware acceleration is on.</p>
        </div>
      </div>
    );
  }

  switch (snap.screen) {
    case "loading":
      return (
        <div className="screen splash">
          <div className="card menu-card">
            <h1 className="logo">
              <Image src="/logo.webp" alt="Thunder Strike" width={1400} height={525} priority unoptimized />
            </h1>
            <div className="load-track">
              <div className="load-fill" style={{ width: `${Math.round(snap.loadProgress * 100)}%` }} />
            </div>
            <p className="muted">{snap.loadLabel}</p>
          </div>
        </div>
      );

    case "title":
      return (
        <div className="screen splash" onPointerDown={() => game?.unlockAudio()}>
          {backendBadge}
          <div className="card title-card menu-card">
            <h1 className="logo">
              <Image src="/logo.webp" alt="Thunder Strike" width={1400} height={525} priority unoptimized />
            </h1>
            <div className="eyebrow">AH-64 ATTACK HELICOPTER SIMULATION</div>
            <p className="tagline">One aircraft. One province. Bring the pilots home.</p>
            {snap.audioReady ? (
              <>
                <button className="btn primary" onClick={() => game?.start()}>
                  START MISSION
                </button>
                <button className="btn" onClick={() => game?.showControls()}>
                  CONTROLS
                </button>
                <button className="btn link" onClick={() => game?.showCredits()}>
                  CREDITS
                </button>
              </>
            ) : (
              <button className="btn primary press-any" onClick={() => game?.unlockAudio()}>
                PRESS ANY KEY
              </button>
            )}
          </div>
        </div>
      );

    case "briefing":
      return (
        <div className="screen">
          <div className="card briefing">
            <div className="eyebrow">MISSION BRIEFING</div>
            <h2 className="subtitle">{mission1.name}</h2>
            {mission1.briefing.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
            <ol className="brief-objectives">
              {mission1.objectives.map((o) => (
                <li key={o.id}>{o.text}</li>
              ))}
            </ol>
            <button className="btn primary" onClick={() => game?.start()}>
              TAKE OFF
            </button>
          </div>
        </div>
      );

    case "paused":
      return (
        <div className="screen dim">
          <div className="card small">
            <h2 className="subtitle">PAUSED</h2>
            <label className="volume">
              Master
              <input type="range" min={0} max={1} step={0.05} value={snap.volume} onChange={(e) => game?.setVolume(parseFloat(e.target.value))} />
            </label>
            <label className="volume">
              Music
              <input type="range" min={0} max={1} step={0.05} value={snap.musicVolume} onChange={(e) => game?.setMusicVolume(parseFloat(e.target.value))} />
            </label>
            <button className="btn" onClick={() => game?.toggleMute()}>
              {snap.muted ? "UNMUTE" : "MUTE"}
            </button>
            <button className="btn primary" onClick={() => game?.togglePause()}>
              RESUME
            </button>
            <button className="btn" onClick={() => game?.showControls()}>
              CONTROLS
            </button>
            <button className="btn" onClick={() => game?.restart()}>
              RESTART MISSION
            </button>
            <button className="btn link" onClick={() => game?.backToTitle()}>
              ABANDON TO TITLE
            </button>
          </div>
        </div>
      );

    case "dead":
      return (
        <div className="screen transparent">
          <div className="flash-text">AIRCRAFT LOST</div>
        </div>
      );

    case "won":
    case "lost": {
      const won = snap.screen === "won";
      const s = snap.stats;
      return (
        <div className="screen dim">
          <div className="card">
            <div className="eyebrow">{won ? "MISSION COMPLETE" : "MISSION FAILED"}</div>
            <h2 className={`subtitle ${won ? "good" : "bad"}`}>{won ? "Welcome home, pilot." : "All airframes lost."}</h2>
            <table className="stats">
              <tbody>
                <tr>
                  <td>Time</td>
                  <td>{formatTime(s.elapsed)}</td>
                </tr>
                <tr>
                  <td>Kills</td>
                  <td>{s.kills}</td>
                </tr>
                <tr>
                  <td>POWs rescued</td>
                  <td>{s.rescued}</td>
                </tr>
                <tr>
                  <td>Rounds fired</td>
                  <td>{s.shotsFired}</td>
                </tr>
                <tr>
                  <td>Damage taken</td>
                  <td>{Math.round(s.damageTaken)}</td>
                </tr>
                <tr>
                  <td>Aircraft lost</td>
                  <td>{s.livesLost}</td>
                </tr>
              </tbody>
            </table>
            <button className="btn primary" onClick={() => game?.restart()}>
              FLY AGAIN
            </button>
            <button className="btn link" onClick={() => game?.backToTitle()}>
              TITLE SCREEN
            </button>
          </div>
        </div>
      );
    }

    case "controls":
      return <ControlsOverlay onClose={() => game?.hideControls()} />;

    case "credits":
      return (
        <div className="screen splash">
          <div className="card menu-card">
            <h1 className="logo">
              <Image src="/logo.webp" alt="Thunder Strike" width={1400} height={525} priority unoptimized />
            </h1>
            <div className="eyebrow">CREDITS</div>
            <p>A tribute to Desert Strike (Electronic Arts, 1992). Built with Three.js on the WebGPU renderer, TSL node materials and Next.js.</p>
            <p>
              Vehicle models: &ldquo;Low Poly Military Vehicles&rdquo; by Zsky, licensed CC-BY 4.0 via Poly Pizza, and a tank by Quaternius (CC0). Via Sketchfab, all CC-BY 4.0: &ldquo;AH-64 Apache&rdquo; by
              Thomas Koenders, &ldquo;Gerald Ford Aircraft Carrier&rdquo; by Uxman, &ldquo;F-16 Fighter Jet&rdquo; by iedalton and &ldquo;Jungle Tent&rdquo; by SyntheticMN. Where a model is
              missing the game builds a procedural placeholder instead.
            </p>
            <p>Music: &ldquo;Iron Sector Run&rdquo;, generated with Suno. Sound effects are synthesised in the browser with the Web Audio API. Title artwork and logo generated with Nano Banana Pro.</p>
            <button className="btn primary" onClick={() => game?.backToTitle()}>
              BACK
            </button>
          </div>
        </div>
      );

    default:
      return snap.backend === "webgl" ? <div className="backend webgl corner">WebGL 2 fallback</div> : null;
  }
}
