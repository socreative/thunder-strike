import * as THREE from "three/webgpu";
import { Entity } from "../entities/Entity";

interface Chunk {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  angVel: THREE.Vector3;
  radius: number;
  resting: boolean;
  bounces: number;
  trailTimer: number;
  burnTimer: number;
  big: boolean;
}

const GRAVITY = 30;
const tmpV = new THREE.Vector3();
const tmpN = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();

/**
 * Bakes a set of triangles from a mesh into a standalone world-space chunk
 * whose origin is the triangle centroid, so it can tumble about itself.
 */
function bakeChunk(mesh: THREE.Mesh, triIndices: number[], material: THREE.Material): { mesh: THREE.Mesh; radius: number } | null {
  const geo = mesh.geometry;
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const nor = geo.attributes.normal as THREE.BufferAttribute | undefined;
  const uv = geo.attributes.uv as THREE.BufferAttribute | undefined;
  const index = geo.index;
  const n = triIndices.length * 3;
  if (n === 0) return null;
  const outPos = new Float32Array(n * 3);
  const outNor = new Float32Array(n * 3);
  const outUv = uv ? new Float32Array(n * 2) : null;
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
  const centroid = new THREE.Vector3();
  let k = 0;
  for (const t of triIndices) {
    for (let c = 0; c < 3; c++) {
      const vi = index ? index.getX(t * 3 + c) : t * 3 + c;
      tmpV.fromBufferAttribute(pos, vi).applyMatrix4(mesh.matrixWorld);
      outPos[k * 3] = tmpV.x;
      outPos[k * 3 + 1] = tmpV.y;
      outPos[k * 3 + 2] = tmpV.z;
      centroid.add(tmpV);
      if (nor) {
        tmpN.fromBufferAttribute(nor, vi).applyMatrix3(normalMatrix).normalize();
        outNor[k * 3] = tmpN.x;
        outNor[k * 3 + 1] = tmpN.y;
        outNor[k * 3 + 2] = tmpN.z;
      }
      if (uv && outUv) {
        outUv[k * 2] = uv.getX(vi);
        outUv[k * 2 + 1] = uv.getY(vi);
      }
      k++;
    }
  }
  centroid.divideScalar(n);
  let radius = 0;
  for (let i = 0; i < n; i++) {
    outPos[i * 3] -= centroid.x;
    outPos[i * 3 + 1] -= centroid.y;
    outPos[i * 3 + 2] -= centroid.z;
    const r = Math.hypot(outPos[i * 3], outPos[i * 3 + 1], outPos[i * 3 + 2]);
    if (r > radius) radius = r;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(outPos, 3));
  if (nor) g.setAttribute("normal", new THREE.BufferAttribute(outNor, 3));
  else g.computeVertexNormals();
  if (outUv) g.setAttribute("uv", new THREE.BufferAttribute(outUv, 2));
  const m = new THREE.Mesh(g, material);
  m.position.copy(centroid);
  m.castShadow = true;
  return { mesh: m, radius: Math.max(0.5, radius * 0.7) };
}

/** Triangle indices of a mesh grouped into bins along its longest local axis. */
function binsAlongLongAxis(mesh: THREE.Mesh, bins: number): number[][] {
  const geo = mesh.geometry;
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const index = geo.index;
  const triCount = index ? index.count / 3 : pos.count / 3;
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const size = new THREE.Vector3();
  bb.getSize(size);
  const axis = size.x >= size.y && size.x >= size.z ? 0 : size.z >= size.y ? 2 : 1;
  const min = bb.min.getComponent(axis);
  const span = Math.max(1e-6, size.getComponent(axis));
  const out: number[][] = Array.from({ length: bins }, () => []);
  for (let t = 0; t < triCount; t++) {
    let c = 0;
    for (let k = 0; k < 3; k++) {
      const vi = index ? index.getX(t * 3 + k) : t * 3 + k;
      c += pos.getComponent(vi, axis);
    }
    c /= 3;
    const b = Math.min(bins - 1, Math.max(0, Math.floor(((c - min) / span) * bins)));
    out[b].push(t);
  }
  return out.filter((b) => b.length > 0);
}

/** Triangle indices of a rotor mesh grouped by angular quadrant about its pivot. */
function bladesByQuadrant(mesh: THREE.Mesh, pivotWorld: THREE.Vector3): number[][] {
  const geo = mesh.geometry;
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const index = geo.index;
  const triCount = index ? index.count / 3 : pos.count / 3;
  const out: number[][] = [[], [], [], []];
  for (let t = 0; t < triCount; t++) {
    tmpV.set(0, 0, 0);
    for (let k = 0; k < 3; k++) {
      const vi = index ? index.getX(t * 3 + k) : t * 3 + k;
      tmpN.fromBufferAttribute(pos, vi).applyMatrix4(mesh.matrixWorld);
      tmpV.add(tmpN);
    }
    tmpV.divideScalar(3).sub(pivotWorld);
    const a = Math.atan2(tmpV.z, tmpV.x);
    const q = Math.floor(((a + Math.PI) / (Math.PI * 2)) * 4) % 4;
    out[q].push(t);
  }
  return out.filter((b) => b.length > 0);
}

/**
 * The player's aircraft coming apart. Built from the actual helicopter meshes
 * so the pieces match whatever model is loaded.
 */
export class HeliWreckage extends Entity {
  private chunks: Chunk[] = [];
  private age = 0;
  private lifetime = 40;
  /** Position the camera should follow while the hull falls. */
  readonly focus = new THREE.Vector3();
  private mainChunk: Chunk | null = null;
  private intact: boolean;
  private exploded = false;
  private scorched = new Map<THREE.Material, THREE.Material>();

  constructor(heliRoot: THREE.Object3D, velocity: THREE.Vector3, intact: boolean) {
    super();
    this.kind = "wreckage";
    this.team = "neutral";
    this.targetable = false;
    this.blip = false;
    this.radius = 0.1;
    this.intact = intact;
    heliRoot.updateMatrixWorld(true);
    this.focus.setFromMatrixPosition(heliRoot.matrixWorld);
    this.pos.copy(this.focus);

    const meshes: THREE.Mesh[] = [];
    heliRoot.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.visible && m.geometry.attributes.position) meshes.push(m);
    });
    const pieces: { mesh: THREE.Mesh; radius: number; big: boolean }[] = [];
    for (const m of meshes) {
      const mat = m.material as THREE.Material;
      // Skip translucent helpers such as the rotor blur disc.
      if (mat.transparent && mat.opacity < 0.5 && !(mat as THREE.MeshBasicNodeMaterial).opacityNode) continue;
      if ((mat as THREE.MeshBasicNodeMaterial).opacityNode) continue;
      const triCount = (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3;
      const isRotor = m.renderOrder === 6 || /blade|rotor/i.test(m.name);
      let groups: number[][];
      if (intact) groups = [Array.from({ length: triCount }, (_, i) => i)];
      else if (isRotor && m.parent) {
        groups = bladesByQuadrant(m, new THREE.Vector3().setFromMatrixPosition(m.parent.matrixWorld));
      } else if (triCount > 60) groups = binsAlongLongAxis(m, 4);
      else groups = [Array.from({ length: triCount }, (_, i) => i)];
      for (const g of groups) {
        const baked = bakeChunk(m, g, this.scorch(mat));
        if (baked) pieces.push({ ...baked, big: g.length > 60 });
      }
    }
    if (intact && pieces.length > 1) {
      // Merge into one tumbling group so the whole airframe falls as one.
      const group = new THREE.Group();
      const centre = new THREE.Vector3();
      for (const p of pieces) centre.add(p.mesh.position);
      centre.divideScalar(pieces.length);
      let radius = 0;
      for (const p of pieces) {
        p.mesh.position.sub(centre);
        group.add(p.mesh);
        radius = Math.max(radius, p.mesh.position.length() + p.radius);
      }
      group.position.copy(centre);
      // The group tumbles as a single chunk until it hits the ground.
      this.addChunk(group as unknown as THREE.Mesh, radius, true, velocity);
      return;
    }
    for (const p of pieces) this.addChunk(p.mesh, p.radius, p.big, velocity);
    // Largest piece is the hull the camera follows.
    this.mainChunk = this.chunks.reduce<Chunk | null>((best, c) => (!best || c.radius > best.radius ? c : best), null);
  }

  /** Darkened copy of a model material that starts glowing hot and cools off. */
  private scorch(source: THREE.Material): THREE.Material {
    let m = this.scorched.get(source);
    if (m) return m;
    m = source.clone();
    const std = m as THREE.MeshStandardMaterial;
    if (std.color) std.color.multiplyScalar(0.55);
    if (std.emissive) {
      std.emissive.setHex(0xff6a1a);
      std.emissiveIntensity = this.intact ? 0 : 1.2;
    }
    m.transparent = false;
    m.opacity = 1;
    this.scorched.set(source, m);
    return m;
  }

  private addChunk(mesh: THREE.Mesh, radius: number, big: boolean, baseVel: THREE.Vector3): void {
    const vel = baseVel.clone();
    if (!this.intact) {
      const a = Math.random() * Math.PI * 2;
      const spd = 6 + Math.random() * 12;
      vel.x += Math.cos(a) * spd;
      vel.z += Math.sin(a) * spd;
      vel.y += 4 + Math.random() * 12;
    } else {
      vel.y -= 2;
    }
    const angVel = new THREE.Vector3((Math.random() - 0.5) * 9, (Math.random() - 0.5) * 9, (Math.random() - 0.5) * 9);
    if (this.intact) angVel.multiplyScalar(0.25);
    this.object.add(mesh);
    this.chunks.push({ mesh, vel, angVel, radius, resting: false, bounces: 0, trailTimer: Math.random() * 0.05, burnTimer: Math.random() * 0.3, big });
  }

  onSpawn(): void {
    // The chunks carry world positions already: the entity itself sits at the origin.
    this.object.position.set(0, 0, 0);
    if (this.intact) this.mainChunk = this.chunks[0] ?? null;
  }

  syncObject(): void {
    // Chunks are placed in world space; keep the container at the origin.
  }

  update(dt: number): void {
    const world = this.world;
    this.age += dt;
    // Hot metal cools over the first few seconds.
    for (const m of this.scorched.values()) {
      const std = m as THREE.MeshStandardMaterial;
      if (std.emissive && std.emissiveIntensity > 0) std.emissiveIntensity = Math.max(0, std.emissiveIntensity - dt * 0.45);
    }
    let anyAirborne = false;
    for (const c of this.chunks) {
      if (c.resting) {
        // Settled pieces smoulder for a while.
        if (c.big && this.age < 25) {
          c.burnTimer -= dt;
          if (c.burnTimer <= 0) {
            c.burnTimer = 0.14 + Math.random() * 0.1;
            world.particles.burningSmoke(c.mesh.position, 1.4);
          }
        }
        continue;
      }
      anyAirborne = true;
      c.vel.y -= GRAVITY * dt;
      c.vel.multiplyScalar(Math.max(0, 1 - 0.25 * dt));
      c.mesh.position.addScaledVector(c.vel, dt);
      // Tumble
      tmpQ.setFromAxisAngle(tmpV.copy(c.angVel).normalize(), c.angVel.length() * dt);
      c.mesh.quaternion.premultiply(tmpQ);

      // Trails
      c.trailTimer -= dt;
      if (c.trailTimer <= 0) {
        c.trailTimer = c.big ? 0.02 : 0.045;
        if (c.big) {
          world.particles.burningSmoke(c.mesh.position, 1.6);
          world.particles.rocketTrail(c.mesh.position, true);
        } else {
          world.particles.rocketTrail(c.mesh.position, false);
        }
      }

      // Ground contact
      const ground = Math.max(world.terrain.heightAt(c.mesh.position.x, c.mesh.position.z), 0);
      if (c.mesh.position.y - c.radius * 0.6 <= ground) {
        c.mesh.position.y = ground + c.radius * 0.6;
        c.bounces++;
        const speed = c.vel.length();
        if (this.intact && !this.exploded) {
          // Fuel starvation: the airframe hits the ground and then blows up.
          this.exploded = true;
          for (const m of this.scorched.values()) {
            const std = m as THREE.MeshStandardMaterial;
            if (std.emissive) std.emissiveIntensity = 1.2;
          }
          world.explode(c.mesh.position, 7, 0, "player", 3.4, this);
          world.shake(3);
          world.audio.play("crash");
          this.breakApart(c);
          return;
        }
        if (c.bounces === 1) {
          world.particles.dustHit(c.mesh.position, c.big ? 3 : 1.4);
          if (c.big) {
            world.explode(c.mesh.position, 4, 0, "player", 2.2, this);
          } else {
            world.audio.play("hit", c.mesh.position);
          }
        }
        if (speed < 4 || c.bounces > 3) {
          c.resting = true;
          c.vel.set(0, 0, 0);
          c.angVel.set(0, 0, 0);
        } else {
          c.vel.y = Math.abs(c.vel.y) * 0.3;
          c.vel.x *= 0.55;
          c.vel.z *= 0.55;
          c.angVel.multiplyScalar(0.5);
        }
      }
    }
    if (this.mainChunk) this.focus.copy(this.mainChunk.mesh.position);
    if (!anyAirborne && this.age > this.lifetime) this.kill();
    world.grid.update(this);
  }

  /** Intact airframe hit the ground: swap it for flying pieces. */
  private breakApart(whole: Chunk): void {
    const group = whole.mesh as unknown as THREE.Group;
    const parts = [...group.children] as THREE.Mesh[];
    group.updateMatrixWorld(true);
    this.chunks = [];
    this.object.remove(group);
    this.intact = false;
    for (const p of parts) {
      p.getWorldPosition(tmpV);
      p.getWorldQuaternion(tmpQ);
      group.remove(p);
      p.position.copy(tmpV);
      p.quaternion.copy(tmpQ);
      p.geometry.computeBoundingSphere();
      const radius = Math.max(0.5, (p.geometry.boundingSphere?.radius ?? 1) * 0.7);
      const big = (p.geometry.attributes.position.count ?? 0) > 180;
      this.addChunk(p, radius, big, new THREE.Vector3(0, 6, 0));
    }
    this.mainChunk = this.chunks.reduce<Chunk | null>((best, c) => (!best || c.radius > best.radius ? c : best), null);
  }

  dispose(): void {
    super.dispose();
    this.object.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.geometry) m.geometry.dispose();
    });
    for (const m of this.scorched.values()) m.dispose();
    this.scorched.clear();
  }
}
