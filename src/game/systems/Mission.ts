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
    o.progress = (o.progress ?? 0) + 1;
    if (o.progress >= (o.total ?? 1)) this.complete(id);
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
