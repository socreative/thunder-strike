import { Entity } from "../Entity";
import { balance } from "../../data/balance";
import { Build, PALETTE as P } from "../../world/Detail";

const S = balance.enemies.mine;
const near: Entity[] = [];

/** A moored contact mine: a dark sphere with horns riding just under the surface. */
export class Mine extends Entity {
  private t = Math.random() * 10;

  constructor() {
    super();
    this.kind = "mine";
    this.tag = "mine";
    this.hp = this.maxHp = S.hp;
    this.radius = S.radius;
    this.barHeight = 2.2;
    const b = new Build();
    b.sphere(1.1, 0x23262a, { y: 0, mat: { roughness: 0.6, metalness: 0.4 } });
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const el = i % 2 ? 0.5 : 0.15;
      b.cyl(0.08, 0.16, 0.7, P.rust, { x: Math.cos(a) * Math.cos(el) * 1.25, y: Math.sin(el) * 1.25 + 0.2, z: Math.sin(a) * Math.cos(el) * 1.25, rx: Math.PI / 2 - el, ry: -a + Math.PI / 2, order: "YXZ", seg: 6 });
    }
    b.cyl(0.9, 0.9, 0.12, P.rust, { y: 0.9, seg: 12 });
    this.object.add(b.finish());
  }

  onSpawn(): void {
    this.pos.y = 0.3;
  }

  update(dt: number): void {
    const world = this.world;
    this.tickFlash(dt);
    this.t += dt;
    this.pos.y = 0.3 + Math.sin(this.t * 1.1) * 0.12;
    this.object.rotation.y += 0.15 * dt;
    this.syncObject();
    // Any friendly hull passing over it sets it off.
    world.grid.query(this.pos.x, this.pos.z, S.trigger + 30, near, (e) => e.team === "player" && e.kind === "tanker" && e.alive);
    for (const e of near) {
      if (e.hitsXZ(this.pos.x, this.pos.z, S.trigger)) {
        this.kill();
        return;
      }
    }
  }

  protected onDeath(source?: Entity): void {
    const world = this.world;
    world.explode(this.pos, S.blast, S.damage, "neutral", 3, this);
    world.particles.splash(this.pos, 3);
    world.reportKill(this, source);
  }
}
