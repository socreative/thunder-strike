import type { ObjectiveState } from "../core/Store";
import type { MissionData, ObjectiveDef } from "../data/mission";
import type { World } from "../World";

/** Tracks objective progress from world events. */
export class Mission {
  readonly objectives: ObjectiveState[];
  won = false;
  radarDown = false;

  constructor(
    private world: World,
    readonly data: MissionData,
  ) {
    this.objectives = data.objectives.map((o) => ({
      id: o.id,
      text: o.text,
      done: false,
      progress: 0,
      total: o.total,
      locked: !!o.final,
    }));

    world.events.on("kill", ({ entity }) => {
      if (!entity.tag) return;
      for (const d of data.objectives) if (d.kind === "destroyTag" && d.tag === entity.tag) this.advance(d.id);
    });
    world.events.on("powRescued", () => {
      for (const d of data.objectives) if (d.kind === "rescue") this.advance(d.id);
    });
    world.events.on("arrived", () => {
      for (const d of data.objectives) if (d.kind === "escort") this.advance(d.id);
    });
    world.events.on("escortLost", () => {
      // The bar lowers to the ships still afloat; with none left the mission is over.
      const alive = world.entities.filter((e) => e.kind === "tanker" && e.alive).length;
      for (const d of data.objectives) {
        if (d.kind !== "escort") continue;
        const o = this.get(d.id);
        if (!o || o.done) continue;
        if (alive === 0 && (o.progress ?? 0) === 0) {
          world.failMission(d.failMessage ?? "The convoy was lost.");
          return;
        }
        o.total = Math.max(1, alive + (o.progress ?? 0));
        if ((o.progress ?? 0) >= o.total) this.complete(d.id);
      }
    });
  }

  private get(id: string): ObjectiveState | undefined {
    return this.objectives.find((o) => o.id === id);
  }

  private def(id: string): ObjectiveDef | undefined {
    return this.data.objectives.find((d) => d.id === id);
  }

  private advance(id: string): void {
    const o = this.get(id);
    if (!o || o.done || o.locked) return;
    const first = (o.progress ?? 0) === 0;
    o.progress = (o.progress ?? 0) + 1;
    if (o.progress >= (o.total ?? 1)) {
      this.complete(id);
      return;
    }
    // A timed objective arms on its first hit unless the cancelling objective already fell.
    const def = this.def(id);
    if (first && def?.deadline) {
      const cancelled = def.deadline.cancelledBy ? this.get(def.deadline.cancelledBy)?.done : false;
      if (!cancelled) this.world.startCountdown(def.deadline.seconds, def.deadline.label, def.deadline.failMessage);
      else this.world.message("Their launch control is gone. Nothing can order a launch now.");
    }
  }

  private complete(id: string): void {
    const o = this.get(id);
    if (!o || o.done) return;
    o.done = true;
    o.progress = o.total;
    const def = this.def(id);
    if (def) {
      this.world.message(def.doneMessage);
      this.world.showBanner(def.kind === "returnToLZ" ? "MISSION COMPLETE" : "OBJECTIVE COMPLETE", def.text);
      if (def.deadline) this.world.stopCountdown();
      if (def.effect === "radarDown") this.radarDown = true;
      if (def.effect === "blackout") this.world.blackout();
    }
    this.world.audio.play("objective");
    this.world.events.emit("objectiveDone", { id });
    if (this.allPrimaryDone()) {
      for (const f of this.objectives) if (f.locked) f.locked = false;
      if (def?.kind !== "returnToLZ") this.world.message("All primary objectives complete. Return to the landing zone for extraction.");
    }
  }

  private allPrimaryDone(): boolean {
    return this.objectives.every((o) => o.done || this.def(o.id)?.final);
  }

  update(): void {
    if (this.won) return;
    const heli = this.world.heli;
    for (const d of this.data.objectives) {
      if (d.kind !== "returnToLZ") continue;
      const o = this.get(d.id);
      if (o && !o.done && !o.locked && heli.alive && heli.atLZ && heli.passengers === 0) this.complete(d.id);
    }
    if (this.objectives.every((o) => o.done)) this.won = true;
  }
}
