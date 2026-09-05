"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Game } from "@/src/game/Game";
import { Store } from "@/src/game/core/Store";
import Hud from "./Hud";
import Screens from "./Screens";

export default function GameShell() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [store] = useState(() => new Store());
  const gameRef = useRef<Game | null>(null);
  const [game, setGame] = useState<Game | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const g = new Game(canvas, store);
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

  return (
    <div className="game-root">
      <canvas ref={canvasRef} className="game-canvas" />
      {(snap.screen === "playing" || snap.screen === "paused" || snap.screen === "dead" || snap.screen === "controls") && <Hud snap={snap} overview={game?.getOverview() ?? null} />}
      <Screens snap={snap} game={game} error={error} />
    </div>
  );
}
