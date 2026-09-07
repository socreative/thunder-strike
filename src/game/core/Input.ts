const GAME_KEYS = new Set([
  "Space",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Tab",
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "KeyQ",
  "KeyE",
  "ShiftLeft",
  "ShiftRight",
  "Digit1",
  "Digit2",
  "Digit3",
  "Enter",
  "Escape",
  "KeyP",
  "KeyM",
  "KeyF",
  "ControlLeft",
  "ControlRight",
]);

/** Analog flight axes. Positive move is forward, positive turn is port, positive strafe is starboard. */
export type Axis = "move" | "turn" | "strafe";

const AXIS_KEYS: Record<Axis, { pos: string[]; neg: string[] }> = {
  move: { pos: ["KeyW", "ArrowUp"], neg: ["KeyS", "ArrowDown"] },
  turn: { pos: ["KeyA", "ArrowLeft"], neg: ["KeyD", "ArrowRight"] },
  strafe: { pos: ["KeyE"], neg: ["KeyQ"] },
};

const clamp1 = (v: number) => (v > 1 ? 1 : v < -1 ? -1 : v);

/**
 * Keyboard state with per-frame edge detection plus wheel accumulation, and a
 * touch layer on top: a screen-space stick vector and virtual keys for the
 * buttons. Virtual keys reuse the keyboard codes so every consumer reads one
 * source regardless of where the press came from.
 */
export class Input {
  private down = new Set<string>();
  private pressed = new Set<string>();
  /**
   * Touch stick in screen space, x right and y up, magnitude at most 1. The
   * helicopter turns it into a heading, so it lives here as a raw vector.
   */
  readonly stick = { x: 0, y: 0 };
  /** Codes currently held by touch, so they can be released together. */
  private touchHeld = new Set<string>();
  /** Codes that went down since the last frame ended. */
  private freshDown = new Set<string>();
  /** Releases deferred until a sim step has seen the press. */
  private pendingRelease = new Set<string>();
  wheel = 0;
  /** Set true on the first user interaction, used to unlock audio. */
  interacted = false;

  private onKeyDown = (e: KeyboardEvent) => {
    if (GAME_KEYS.has(e.code)) e.preventDefault();
    if (e.repeat) return;
    this.interacted = true;
    this.down.add(e.code);
    this.pressed.add(e.code);
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.down.delete(e.code);
  };

  private onWheel = (e: WheelEvent) => {
    this.wheel += e.deltaY;
  };

  private onBlur = () => {
    this.down.clear();
    this.clearTouch();
  };

  private onPointer = () => {
    this.interacted = true;
  };

  attach(): void {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("wheel", this.onWheel, { passive: true });
    window.addEventListener("blur", this.onBlur);
    // On pointerup rather than pointerdown: the audio unlock this triggers
    // re-renders the title menu, and if that happened while a finger was still
    // down the tap's click would land on whichever button took the old spot.
    window.addEventListener("pointerup", this.onPointer);
  }

  detach(): void {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("wheel", this.onWheel);
    window.removeEventListener("blur", this.onBlur);
    window.removeEventListener("pointerup", this.onPointer);
  }

  isDown(...codes: string[]): boolean {
    for (const c of codes) if (this.down.has(c)) return true;
    return false;
  }

  anyPressed(): boolean {
    return this.pressed.size > 0;
  }

  wasPressed(...codes: string[]): boolean {
    for (const c of codes) if (this.pressed.has(c)) return true;
    return false;
  }

  /** Like wasPressed, but consumes the edge so a per-frame handler cannot see it twice. */
  take(...codes: string[]): boolean {
    let hit = false;
    for (const c of codes) if (this.pressed.delete(c)) hit = true;
    return hit;
  }

  /** Keyboard axis: -1, 0 or 1. */
  axis(name: Axis): number {
    const k = AXIS_KEYS[name];
    return (this.isDown(...k.pos) ? 1 : 0) - (this.isDown(...k.neg) ? 1 : 0);
  }

  setStick(x: number, y: number): void {
    this.stick.x = clamp1(x);
    this.stick.y = clamp1(y);
    this.interacted = true;
  }

  /**
   * Virtual key from a touch button. A press and release inside one frame is
   * still held for the next sim step, so a quick tap on FIRE launches a rocket.
   */
  setVirtual(code: string, held: boolean): void {
    if (held) {
      if (!this.down.has(code)) {
        this.pressed.add(code);
        this.freshDown.add(code);
      }
      this.down.add(code);
      this.touchHeld.add(code);
      this.interacted = true;
    } else if (this.freshDown.has(code)) {
      this.pendingRelease.add(code);
    } else {
      this.down.delete(code);
      this.touchHeld.delete(code);
    }
  }

  /** Release everything touch put in: on pointer cancel, tab hide and layer unmount. */
  clearTouch(): void {
    for (const c of this.touchHeld) this.down.delete(c);
    this.touchHeld.clear();
    this.pendingRelease.clear();
    this.freshDown.clear();
    this.stick.x = 0;
    this.stick.y = 0;
  }

  /** Clear edge-triggered state. Call once after each simulated frame. */
  endFrame(): void {
    this.pressed.clear();
    this.wheel = 0;
    for (const c of this.pendingRelease) {
      this.down.delete(c);
      this.touchHeld.delete(c);
    }
    this.pendingRelease.clear();
    this.freshDown.clear();
  }
}
