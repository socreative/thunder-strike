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

/** Keyboard state with per-frame edge detection plus wheel accumulation. */
export class Input {
  private down = new Set<string>();
  private pressed = new Set<string>();
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
  };

  private onPointer = () => {
    this.interacted = true;
  };

  attach(): void {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("wheel", this.onWheel, { passive: true });
    window.addEventListener("blur", this.onBlur);
    window.addEventListener("pointerdown", this.onPointer);
  }

  detach(): void {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("wheel", this.onWheel);
    window.removeEventListener("blur", this.onBlur);
    window.removeEventListener("pointerdown", this.onPointer);
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

  /** Clear edge-triggered state. Call once at the end of each frame. */
  endFrame(): void {
    this.pressed.clear();
    this.wheel = 0;
  }
}
