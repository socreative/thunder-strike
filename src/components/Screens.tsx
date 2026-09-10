"use client";

import type { Snapshot } from "@/src/game/core/Store";
import type { Game } from "@/src/game/Game";
import Image from "next/image";
import ControlsOverlay from "./ControlsOverlay";

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${r.toString().padStart(2, "0")}`;
}

export default function Screens({ snap, game, error, touch }: { snap: Snapshot; game: Game | null; error: string | null; touch: boolean }) {
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
        <div className="screen splash" onClick={() => game?.unlockAudio()}>
          {backendBadge}
          <div className="card title-card menu-card">
            <h1 className="logo">
              <Image src="/logo.webp" alt="Thunder Strike" width={1400} height={525} priority unoptimized />
            </h1>
            <div className="eyebrow">AH-64 ATTACK HELICOPTER SIMULATION</div>
            <p className="tagline">One aircraft. One province. Bring the pilots home.</p>
            {snap.audioReady ? (
              <>
                <button className="btn primary" onClick={() => game?.start(true)}>
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
                {touch ? "TAP TO START" : "PRESS ANY KEY"}
              </button>
            )}
          </div>
        </div>
      );

    case "missions":
      return (
        <div className="screen splash">
          <div className="card menu-card missions-card">
            <div className="eyebrow">SELECT MISSION</div>
            <div className="mission-cards">
              {snap.missions.map((m, i) => (
                <button key={m.id} className={`mission-card ${i === snap.missionCursor ? "active" : ""}`} onClick={() => game?.selectMission(m.id)}>
                  <span className="swatch" style={{ background: `#${m.swatch.toString(16).padStart(6, "0")}` }} />
                  <span className="mission-code">
                    {String(i + 1).padStart(2, "0")} {m.codename}
                  </span>
                  <span className="mission-name">{m.name}</span>
                  <span className="mission-summary">{m.summary}</span>
                </button>
              ))}
            </div>
            <button className="btn link" onClick={() => game?.backToTitle()}>
              BACK
            </button>
          </div>
        </div>
      );

    case "briefing":
      return (
        <div className="screen">
          <div className="card briefing">
            <div className="eyebrow">MISSION BRIEFING</div>
            <h2 className="subtitle">{snap.missionName}</h2>
            {/* Two columns on a phone held sideways so the button stays in view. */}
            <div className="brief-cols">
              <div className="brief-text">
                {snap.briefing.map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </div>
              <div className="brief-side">
                <ol className="brief-objectives">
                  {snap.objectives.map((o) => (
                    <li key={o.id}>{o.text}</li>
                  ))}
                </ol>
                <button className="btn primary" onClick={() => game?.start(true)}>
                  TAKE OFF
                </button>
              </div>
            </div>
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
            <h2 className={`subtitle ${won ? "good" : "bad"}`}>{won ? "Welcome home, pilot." : snap.lostReason || "All airframes lost."}</h2>
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
            {won && snap.missions.length > 1 && (
              <button className="btn primary" onClick={() => game?.selectMission(game.nextMissionId())}>
                NEXT MISSION
              </button>
            )}
            <button className={`btn ${won && snap.missions.length > 1 ? "" : "primary"}`} onClick={() => game?.restart()}>
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
      return <ControlsOverlay onClose={() => game?.hideControls()} touch={touch} />;

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
              Thomas Koenders, &ldquo;Gerald Ford Aircraft Carrier&rdquo; by Uxman, &ldquo;F-16 Fighter Jet&rdquo; by iedalton, &ldquo;Jungle Tent&rdquo; by SyntheticMN and &ldquo;Patrol Boat PBR MK2&rdquo; by Savy. Where a model is
              missing the game builds a procedural placeholder instead.
            </p>
            <p>Music: &ldquo;Iron Sector Run&rdquo;, &ldquo;Jungle Advance&rdquo; and &ldquo;Arctic Front&rdquo;, generated with Suno. The rotor is a recording by freesound_community via Pixabay; other sound effects are synthesised in the browser with the Web Audio API. Title artwork and logo generated with Nano Banana Pro; app icon generated with Nano Banana Pro via Higgsfield.</p>
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
