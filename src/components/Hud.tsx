"use client";

import type { Snapshot, WeaponId } from "@/src/game/core/Store";
import Minimap from "./Minimap";
import type { Game } from "@/src/game/Game";
import { BurstIcon, FuelIcon, GunIcon, HeliIcon, MissileIcon, PersonIcon, RocketIcon, ShieldIcon } from "./HudIcons";

/** Icon plus bar, no label: the phone strip has no room for words. */
function MiniBar({ icon, value, max, warn }: { icon: React.ReactNode; value: number; max: number; warn: boolean }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className={`mini-bar ${warn ? "bar-warn" : ""}`}>
      {icon}
      <div className="bar-track">
        <div className="bar-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** Status strip: shield, fuel, lives and passengers as icons and bars. */
function StatusStrip({ snap }: { snap: Snapshot }) {
  return (
    <div className="hud-tl status-strip glass rect">
      <MiniBar icon={<ShieldIcon />} value={snap.armor} max={snap.armorMax} warn={snap.lowArmor} />
      <MiniBar icon={<FuelIcon />} value={snap.fuel} max={snap.fuelMax} warn={snap.lowFuel} />
      <div className="mini-row">
        <span className="lives">
          {Array.from({ length: 3 }, (_, i) => (
            <span key={i} className={i < snap.lives ? "life-heli on" : "life-heli"}>
              <HeliIcon />
            </span>
          ))}
        </span>
        <span className="pax-chip">
          <PersonIcon />
          {snap.passengers}/{snap.passengersMax}
        </span>
      </div>
    </div>
  );
}

const WEAPON_ICONS: Record<WeaponId, () => React.JSX.Element> = { gun: GunIcon, hydra: RocketIcon, hellfire: MissileIcon };

/** Weapon chips for keyboard and mouse play; on phones the touch layer draws its own. */
function WeaponChips({ snap, game }: { snap: Snapshot; game: Game | null }) {
  return (
    <div className="hud-tr weapon-chips">
      {WEAPONS.map((w) => {
        const Icon = WEAPON_ICONS[w.id];
        return (
          <button key={w.id} className={`chip glass rect ${snap.weapon === w.id ? "active" : ""} ${snap.ammo[w.id] === 0 ? "empty" : ""}`} onClick={() => game?.selectWeapon(w.id)} aria-label={w.label}>
            <span className="chip-key">{w.key}</span>
            <Icon />
            <span className="chip-count">{snap.ammo[w.id]}</span>
          </button>
        );
      })}
      <div className={`chip glass rect flares ${snap.flares === 0 ? "empty" : ""}`} aria-label="Flares">
        <span className="chip-key">F</span>
        <BurstIcon />
        <span className="chip-count">{snap.flares}</span>
      </div>
    </div>
  );
}

const WEAPONS: { id: WeaponId; label: string; key: string }[] = [
  { id: "gun", label: "CHAIN GUN", key: "1" },
  { id: "hydra", label: "HYDRA", key: "2" },
  { id: "hellfire", label: "HELLFIRE", key: "3" },
];

export default function Hud({ snap, overview, touch, game }: { snap: Snapshot; overview: ImageData | null; touch: boolean; game: Game | null }) {
  const current = snap.objectives.find((o) => !o.done && !o.locked) ?? snap.objectives.find((o) => !o.done);
  return (
    <div className="hud" aria-hidden>
      <StatusStrip snap={snap} />
      {!touch && <WeaponChips snap={snap} game={game} />}
      {!touch && (
        <>
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
        </>
      )}

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
        <button className="minimap-button" onClick={() => game?.toggleBigMap()} aria-label="Open the map">
          <Minimap snap={snap} overview={overview} size={touch ? 104 : 184} />
        </button>
      </div>

      {snap.bigMap && (
        <div className="big-map-layer" onClick={() => game?.toggleBigMap()}>
          <div className="big-map glass rect" onClick={(e) => e.stopPropagation()}>
            <div className="big-map-head">
              <span className="eyebrow">{snap.missionCodename} TACTICAL MAP</span>
              <button className="btn link big-map-close" onClick={() => game?.toggleBigMap()}>
                CLOSE
              </button>
            </div>
            <Minimap snap={snap} overview={overview} size={560} />
            <div className="map-key">
              <span>
                <i style={{ background: "#ffffff" }} /> landing zone
              </span>
              <span>
                <i style={{ background: "#ffd24a" }} /> objective
              </span>
              <span>
                <i style={{ background: "#ff5a3c" }} /> enemy
              </span>
              <span>
                <i style={{ background: "#ff3cc8" }} /> missile site
              </span>
              <span>
                <i style={{ background: "#6ad0ff" }} /> supplies
              </span>
              <span>
                <i style={{ background: "#8dff7a" }} /> prisoner
              </span>
            </div>
          </div>
        </div>
      )}

      <div className="hud-center">
        {snap.countdown && (
          <div className={`alert glass rect countdown ${snap.countdown.remaining < 15 ? "urgent" : ""}`}>
            {snap.countdown.label} {Math.floor(snap.countdown.remaining / 60)}:{String(Math.floor(snap.countdown.remaining % 60)).padStart(2, "0")}
          </div>
        )}
        {snap.incoming && <div className="alert glass rect incoming">MISSILE INCOMING</div>}
        {snap.banner && (
          <div className="alert glass rect objective" key={snap.banner.text}>
            {snap.banner.title}
            <span className="alert-sub">{snap.banner.text}</span>
          </div>
        )}
        {snap.lowFuel && !snap.incoming && <div className="alert glass rect fuel">FUEL LOW</div>}
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
          <div key={m.id} className="msg glass rect">
            <span className="msg-prefix">HQ</span> {m.text}
          </div>
        ))}
      </div>

      <div className="hud-fps">{snap.fps} fps</div>
    </div>
  );
}
