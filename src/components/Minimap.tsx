"use client";

import { useEffect, useRef } from "react";
import type { Snapshot } from "@/src/game/core/Store";

const COLORS: Record<string, string> = {
  enemy: "#ff5a3c",
  sam: "#ff3cc8",
  objective: "#ffd24a",
  pickup: "#6ad0ff",
  pow: "#8dff7a",
  lz: "#ffffff",
  missile: "#ff2a2a",
  friendly: "#bfe9ff",
};

export default function Minimap({ snap, overview, size = 184 }: { snap: Snapshot; overview: ImageData | null; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const bgRef = useRef<HTMLCanvasElement | null>(null);

  // Cache the terrain overview as an offscreen canvas once.
  useEffect(() => {
    if (!overview) return;
    const c = document.createElement("canvas");
    c.width = overview.width;
    c.height = overview.height;
    c.getContext("2d")!.putImageData(overview, 0, 0);
    bgRef.current = c;
  }, [overview]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const s = size;
    const half = snap.mapSize / 2;
    const toPx = (x: number) => ((x + half) / snap.mapSize) * s;
    ctx.clearRect(0, 0, s, s);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, s, s);
    ctx.clip();
    if (bgRef.current) {
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(bgRef.current, 0, 0, s, s);
    } else {
      ctx.fillStyle = "#3a3325";
      ctx.fillRect(0, 0, s, s);
    }
    // Radar range ring when the network is still up.
    if (!snap.radarDown) {
      ctx.strokeStyle = "rgba(255,255,255,0.25)";
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.arc(toPx(snap.heli.x), toPx(snap.heli.z), (140 / snap.mapSize) * s, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    for (const b of snap.blips) {
      const x = toPx(b.x);
      const y = toPx(b.z);
      ctx.fillStyle = COLORS[b.kind] ?? "#fff";
      if (b.kind === "lz") {
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillRect(x - 1, y - 1, 2, 2);
      } else if (b.kind === "objective" || b.kind === "sam") {
        ctx.beginPath();
        ctx.moveTo(x, y - 4);
        ctx.lineTo(x + 4, y);
        ctx.lineTo(x, y + 4);
        ctx.lineTo(x - 4, y);
        ctx.closePath();
        ctx.fill();
      } else if (b.kind === "pickup" || b.kind === "pow") {
        ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
      } else {
        ctx.beginPath();
        ctx.arc(x, y, b.kind === "missile" ? 2.5 : 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Helicopter marker with heading.
    const hx = toPx(snap.heli.x);
    const hy = toPx(snap.heli.z);
    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(-snap.heli.heading + Math.PI);
    ctx.fillStyle = "#e8ffe0";
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(4, 5);
    ctx.lineTo(0, 3);
    ctx.lineTo(-4, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.restore();
    // Frame
    ctx.strokeStyle = "rgba(240,230,200,0.5)";
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, s - 1, s - 1);
  }, [snap, size]);

  return (
    <div className="minimap panel">
      <canvas ref={ref} width={size} height={size} />
      <div className="minimap-caption">{snap.radarDown ? "FULL RADAR PICTURE" : "LOCAL RADAR ONLY"}</div>
    </div>
  );
}
