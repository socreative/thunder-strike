import type { ObjectiveState } from "../core/Store";
import type { MissionData } from "../data/mission1";
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
      switch (entity.tag) {
        case "radar":
          this.radarDown = true;
          this.complete("radar");
          break;
        case "sam":
          this.advance("sams");
          break;
        case "hq":
          this.complete("hq");
          break;
      }
    });
    world.events.on("powRescued", () => this.advance("pows"));
  }

  private get(id: string): ObjectiveState | undefined {
    return this.objectives.find((o) => o.id === id);
  }

  private advance(id: string): void {
    const o = this.get(id);
    if (!o || o.done) return;
    o.progress = (o.progress ?? 0) + 1;
    if (o.progress >= (o.total ?? 1)) this.complete(id);
  }

  private complete(id: string): void {
    const o = this.get(id);
    if (!o || o.done) return;
    o.done = true;
    o.progress = o.total;
    const def = this.data.objectives.find((d) => d.id === id);
    if (def) this.world.message(def.doneMessage);
    this.world.audio.play("objective");
    this.world.events.emit("objectiveDone", { id });
    if (this.allPrimaryDone()) {
      for (const f of this.objectives) if (f.locked) f.locked = false;
      if (id !== "return") this.world.message("All primary objectives complete. Return to the landing zone for extraction.");
    }
  }

  private allPrimaryDone(): boolean {
    return this.objectives.every((o) => o.done || this.data.objectives.find((d) => d.id === o.id)?.final);
  }

  update(): void {
    if (this.won) return;
    const ret = this.get("return");
    if (ret && !ret.done && !ret.locked && this.world.heli.alive && this.world.heli.atLZ && this.world.heli.passengers === 0) {
      this.complete("return");
    }
    if (this.objectives.every((o) => o.done)) this.won = true;
  }
}
