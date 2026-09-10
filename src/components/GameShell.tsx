"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Game } from "@/src/game/Game";
import { detectTouchMode } from "@/src/game/core/Device";
import { Store } from "@/src/game/core/Store";
import Hud from "./Hud";
import Screens from "./Screens";
import TouchControls from "./TouchControls";

const PORTRAIT = "(orientation: portrait)";
const subscribePortrait = (cb: () => void) => {
  const mq = window.matchMedia(PORTRAIT);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};
const readPortrait = () => window.matchMedia(PORTRAIT).matches;

export default function GameShell() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [store] = useState(() => new Store());
  const gameRef = useRef<Game | null>(null);
  const [game, setGame] = useState<Game | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [touch, setTouch] = useState(false);
  const portrait = useSyncExternalStore(subscribePortrait, readPortrait, () => false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const touchMode = detectTouchMode();
    setTouch(touchMode);
    const g = new Game(canvas, store);
    // A phone in landscape is short, so start a little closer to the aircraft.
    if (touchMode) g.zoomBy(-250);
    gameRef.current = g;
    setGame(g);
    g.init().catch((err: unknown) => {
      console.error(err);
      setError(err instanceof Error ? err.message : String(err));
    });
    return () => {
      g.dispose();
      gameRef.current = null;
    };
  }, [store]);

  const snap = useSyncExternalStore(store.subscribe, store.get, store.get);
  const inMission = snap.screen === "playing" || snap.screen === "dead";
  const showHud = inMission || snap.screen === "paused" || snap.screen === "controls";
  const rotate = touch && portrait && snap.screen !== "loading";

  // Flying blind while the phone is held the wrong way is not fair on the pilot.
  useEffect(() => {
    if (rotate && snap.screen === "playing") game?.togglePause();
  }, [rotate, snap.screen, game]);

  return (
    <div className={`game-root ${touch ? "touch" : ""}`} onContextMenu={(e) => e.preventDefault()}>
      <canvas ref={canvasRef} className="game-canvas" />
      {touch && game && inMission && <TouchControls game={game} snap={snap} />}
      {showHud && <Hud snap={snap} overview={game?.getOverview() ?? null} touch={touch} game={game} />}
      <Screens snap={snap} game={game} error={error} touch={touch} />
      {rotate && (
        <div className="screen dim rotate-hint">
          <div className="rotate-glyph" />
          <div className="eyebrow">ROTATE YOUR PHONE TO LANDSCAPE</div>
        </div>
      )}
    </div>
  );
}
