import type * as THREE from "three/webgpu";
import type { Entity } from "../entities/Entity";

export interface GameEvents {
  kill: { entity: Entity; byPlayer: boolean };
  explosion: { pos: THREE.Vector3; size: number };
  playerHit: { amount: number };
  playerDied: Record<string, never>;
  pickup: { kind: string };
  powRescued: { count: number };
  powBoarded: Record<string, never>;
  message: { text: string };
  objectiveDone: { id: string };
  missionWon: Record<string, never>;
  missionLost: Record<string, never>;
  /** An escorted ship reached the end of its lane. */
  arrived: { entity: Entity };
  /** An escorted ship was sunk. */
  escortLost: { entity: Entity };
  samLaunch: Record<string, never>;
  shot: { kind: string; pos: THREE.Vector3 };
}

type Handler<T> = (payload: T) => void;

export class Emitter {
  private handlers = new Map<string, Set<Handler<unknown>>>();

  on<K extends keyof GameEvents>(type: K, handler: Handler<GameEvents[K]>): () => void {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    set.add(handler as Handler<unknown>);
    return () => set!.delete(handler as Handler<unknown>);
  }

  emit<K extends keyof GameEvents>(type: K, payload: GameEvents[K]): void {
    const set = this.handlers.get(type);
    if (!set) return;
    for (const h of set) h(payload);
  }

  clear(): void {
    this.handlers.clear();
  }
}
