"use client";

import { useEffect, useRef } from "react";
import type { Game } from "@/src/game/Game";
import type { Snapshot } from "@/src/game/core/Store";

/** Knob travel in CSS pixels, and the fraction of it treated as centre. */
const STICK_RADIUS = 58;
const DEAD_ZONE = 0.12;
/** Pinch distance to camera zoom, in the units the mouse wheel uses. */
const PINCH_GAIN = 0.9;

/**
 * Map a stick deflection to the three flight axes. Forward is thrust with
 * sideways as turn. Pulled back, the angle decides: straight back reverses,
 * 45 degrees slides, 90 degrees turns, blended smoothly between.
 */
function mapStick(nx: number, ny: number): { move: number; turn: number; strafe: number } {
  const mag = Math.min(1, Math.hypot(nx, ny));
  if (mag < DEAD_ZONE) return { move: 0, turn: 0, strafe: 0 };
  const lin = (mag - DEAD_ZONE) / (1 - DEAD_ZONE);
  // Squared response leaves fine control near centre for lining up the winch.
  const m = lin * lin;
  const ux = nx / mag;
  const uy = ny / mag;
  if (uy >= 0) return { move: uy * m, turn: -ux * m, strafe: 0 };
  const ang = Math.atan2(Math.abs(ux), -uy); // 0 straight back, pi/2 pure sideways
  const s = Math.sin(2 * ang);
  const strafeW = s * s; // peaks at 45 degrees, zero at 0 and 90
  return {
    move: uy * m * (1 - 0.6 * strafeW),
    turn: -ux * m * (1 - strafeW),
    strafe: Math.sign(ux) * m * strafeW,
  };
}

/**
 * On-screen controls for phones: a floating thumbstick on the left, FIRE and
 * FLARES under the right thumb, PAUSE at the top, pinch anywhere else to zoom.
 * All pointer handling is native and imperative so a 60 Hz drag never causes
 * a React render; React only draws the structure and the ammo labels.
 */
export default function TouchControls({ game, snap }: { game: Game; snap: Snapshot }) {
  const layerRef = useRef<HTMLDivElement>(null);
  const zoneRef = useRef<HTMLDivElement>(null);
  const baseRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const fireRef = useRef<HTMLButtonElement>(null);
  const flareRef = useRef<HTMLButtonElement>(null);
  const pauseRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const layer = layerRef.current;
    const zone = zoneRef.current;
    const base = baseRef.current;
    const knob = knobRef.current;
    const fire = fireRef.current;
    const flare = flareRef.current;
    const pause = pauseRef.current;
    if (!layer || !zone || !base || !knob || !fire || !flare || !pause) return;
    const input = game.input;
    const opts: AddEventListenerOptions = { passive: false };
    const cleanups: (() => void)[] = [];
    const on = <K extends keyof HTMLElementEventMap>(el: HTMLElement, type: K, fn: (e: HTMLElementEventMap[K]) => void) => {
      el.addEventListener(type, fn as EventListener, opts);
      cleanups.push(() => el.removeEventListener(type, fn as EventListener));
    };

    /* Stick */
    let stickId: number | null = null;
    let ox = 0;
    let oy = 0;
    const showStick = (x: number, y: number) => {
      // Shown before measuring: a hidden element reports no size.
      base.classList.add("on");
      base.style.transform = `translate(${x - base.offsetWidth / 2}px, ${y - base.offsetHeight / 2}px)`;
      knob.style.transform = "translate(0px, 0px)";
    };
    const moveStick = (x: number, y: number) => {
      let dx = x - ox;
      let dy = y - oy;
      const len = Math.hypot(dx, dy);
      if (len > STICK_RADIUS) {
        dx *= STICK_RADIUS / len;
        dy *= STICK_RADIUS / len;
      }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      const axes = mapStick(dx / STICK_RADIUS, -dy / STICK_RADIUS);
      input.setAxis("move", axes.move);
      input.setAxis("turn", axes.turn);
      input.setAxis("strafe", axes.strafe);
    };
    const endStick = () => {
      stickId = null;
      base.classList.remove("on");
      input.setAxis("move", 0);
      input.setAxis("turn", 0);
      input.setAxis("strafe", 0);
    };
    on(zone, "pointerdown", (e) => {
      if (stickId !== null) return;
      e.preventDefault();
      game.unlockAudio();
      stickId = e.pointerId;
      zone.setPointerCapture(e.pointerId);
      const r = zone.getBoundingClientRect();
      ox = e.clientX - r.left;
      oy = e.clientY - r.top;
      showStick(ox, oy);
    });
    on(zone, "pointermove", (e) => {
      if (e.pointerId !== stickId) return;
      e.preventDefault();
      const r = zone.getBoundingClientRect();
      moveStick(e.clientX - r.left, e.clientY - r.top);
    });
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"] as const) {
      on(zone, type, (e) => {
        if (e.pointerId === stickId) endStick();
      });
    }

    /* Hold and tap buttons, each owning at most one pointer. */
    const button = (el: HTMLButtonElement, code: string) => {
      let id: number | null = null;
      const release = () => {
        if (id === null) return;
        id = null;
        el.classList.remove("pressed");
        input.setVirtual(code, false);
      };
      on(el, "pointerdown", (e) => {
        if (id !== null) return;
        e.preventDefault();
        game.unlockAudio();
        id = e.pointerId;
        el.setPointerCapture(e.pointerId);
        el.classList.add("pressed");
        input.setVirtual(code, true);
      });
      for (const type of ["pointerup", "pointercancel", "lostpointercapture"] as const) {
        on(el, type, (e) => {
          if (e.pointerId === id) release();
        });
      }
      cleanups.push(release);
    };
    button(fire, "Space");
    button(flare, "KeyF");
    button(pause, "Escape");

    /* Pinch zoom on the bare layer. Single touches there do nothing. */
    const pinch = new Map<number, { x: number; y: number }>();
    let lastDist = 0;
    const pinchDist = () => {
      const [a, b] = [...pinch.values()];
      return Math.hypot(a.x - b.x, a.y - b.y);
    };
    on(layer, "pointerdown", (e) => {
      if (e.target !== layer) return;
      e.preventDefault();
      game.unlockAudio();
      layer.setPointerCapture(e.pointerId);
      pinch.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch.size === 2) lastDist = pinchDist();
    });
    on(layer, "pointermove", (e) => {
      const p = pinch.get(e.pointerId);
      if (!p) return;
      p.x = e.clientX;
      p.y = e.clientY;
      if (pinch.size === 2) {
        const d = pinchDist();
        game.zoomBy((lastDist - d) * PINCH_GAIN);
        lastDist = d;
      }
    });
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"] as const) {
      on(layer, type, (e) => {
        pinch.delete(e.pointerId);
      });
    }

    /* Safari's own page zoom gesture and the long-press menu. */
    const swallow = (e: Event) => e.preventDefault();
    for (const type of ["gesturestart", "gesturechange", "gestureend"]) {
      document.addEventListener(type, swallow, opts);
      cleanups.push(() => document.removeEventListener(type, swallow));
    }
    on(layer, "contextmenu", swallow);
    const onHide = () => {
      if (document.visibilityState === "hidden") {
        endStick();
        input.clearTouch();
      }
    };
    document.addEventListener("visibilitychange", onHide);
    cleanups.push(() => document.removeEventListener("visibilitychange", onHide));

    return () => {
      for (const c of cleanups) c();
      input.clearTouch();
    };
  }, [game]);

  return (
    <div ref={layerRef} className="touch-layer">
      <div ref={zoneRef} className="stick-zone">
        <div ref={baseRef} className="stick-base">
          <div ref={knobRef} className="stick-knob" />
        </div>
      </div>
      <button ref={pauseRef} className="tbtn pause" aria-label="Pause">
        <span className="pause-glyph" />
      </button>
      <button ref={flareRef} className={`tbtn flare ${snap.flares === 0 ? "empty" : ""}`}>
        <span className="tbtn-label">FLARES</span>
        <span className="tbtn-count">{snap.flares}</span>
      </button>
      <button ref={fireRef} className={`tbtn fire ${snap.ammo[snap.weapon] === 0 ? "empty" : ""}`}>
        <span className="tbtn-label">FIRE</span>
        <span className="tbtn-count">{snap.ammo[snap.weapon]}</span>
      </button>
    </div>
  );
}
