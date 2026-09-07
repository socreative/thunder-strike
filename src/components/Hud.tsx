"use client";

import type { Snapshot, WeaponId } from "@/src/game/core/Store";
import type { Game } from "@/src/game/Game";
import Minimap from "./Minimap";

const WEAPONS: { id: WeaponId; label: string; key: string }[] = [
  { id: "gun", label: "CHAIN GUN", key: "1" },
  { id: "hydra", label: "HYDRA", key: "2" },
  { id: "hellfire", label: "HELLFIRE", key: "3" },
];

function Bar({ value, max, label, warn }: { value: number; max: number; label: string; warn: boolean }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className={`bar ${warn ? "bar-warn" : ""}`}>
      <div className="bar-head">
        <span>{label}</span>
        <span className="bar-value">{Math.round(value)}</span>
      </div>
      <div className="bar-track">
        <div className="bar-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function Hud({ snap, overview, touch, game }: { snap: Snapshot; overview: ImageData | null; touch: boolean; game: Game | null }) {
  const current = snap.objectives.find((o) => !o.done && !o.locked) ?? snap.objectives.find((o) => !o.done);
  return (
    <div className="hud" aria-hidden>
      <div className="hud-tl panel">
        <Bar value={snap.armor} max={snap.armorMax} label="ARMOUR" warn={snap.lowArmor} />
        <Bar value={snap.fuel} max={snap.fuelMax} label="FUEL" warn={snap.lowFuel} />
        <div className="hud-row">
          <span>LIVES</span>
          <span className="lives">
            {Array.from({ length: 3 }, (_, i) => (
              <span key={i} className={i < snap.lives ? "life on" : "life"} />
            ))}
          </span>
          <span>PAX</span>
          <span className="pax">
            {snap.passengers}/{snap.passengersMax}
          </span>
        </div>
      </div>

      <div className="hud-tr panel">
        {WEAPONS.map((w) => (
          <div
            key={w.id}
            className={`weapon ${snap.weapon === w.id ? "active" : ""} ${snap.ammo[w.id] === 0 ? "empty" : ""}`}
            onPointerDown={touch ? () => game?.selectWeapon(w.id) : undefined}
          >
            <span className="weapon-key">{w.key}</span>
            <span className="weapon-name">{w.label}</span>
            <span className="weapon-ammo">{snap.ammo[w.id]}</span>
          </div>
        ))}
        <div className={`weapon flares ${snap.flares === 0 ? "empty" : ""}`}>
          <span className="weapon-key">F</span>
          <span className="weapon-name">FLARES</span>
          <span className="weapon-ammo">{snap.flares}</span>
        </div>
      </div>

      <div className="hud-bl panel">
        <div className="obj-title">OBJECTIVES</div>
        <ol className="objectives">
          {snap.objectives.map((o) => (
            <li key={o.id} className={o.done ? "done" : o.locked ? "locked" : ""}>
              <span className="obj-mark">{o.done ? "■" : "□"}</span>
              <span className="obj-text">{o.text}</span>
              {o.total && o.total > 1 && !o.done && (
                <span className="obj-prog">
                  {o.progress ?? 0}/{o.total}
                </span>
              )}
            </li>
          ))}
        </ol>
      </div>

      {touch && current && (
        <div className="obj-pill panel">
          <span className="obj-mark">□</span>
          <span className="obj-text">{current.text}</span>
          {current.total && current.total > 1 && (
            <span className="obj-prog">
              {current.progress ?? 0}/{current.total}
            </span>
          )}
        </div>
      )}

      <div className="hud-br">
        <Minimap snap={snap} overview={overview} size={touch ? 104 : 184} />
      </div>

      <div className="hud-center">
        {snap.incoming && <div className="alert incoming">MISSILE INCOMING</div>}
        {snap.lowFuel && !snap.incoming && <div className="alert fuel">FUEL LOW</div>}
        {snap.winchLabel && (
          <div className="winch">
            <div className="winch-label">{snap.winchLabel}</div>
            {snap.winchProgress > 0 && (
              <div className="winch-track">
                <div className="winch-fill" style={{ width: `${Math.min(100, snap.winchProgress * 100)}%` }} />
              </div>
            )}
          </div>
        )}
      </div>

      <div className="hud-messages">
        {snap.messages.slice(touch ? -2 : -4).map((m) => (
          <div key={m.id} className="msg">
            <span className="msg-prefix">HQ</span> {m.text}
          </div>
        ))}
      </div>

      <div className="hud-fps">{snap.fps} fps</div>
    </div>
  );
}
