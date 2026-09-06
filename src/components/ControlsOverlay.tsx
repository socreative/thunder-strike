"use client";

function Key({ children, wide, tall }: { children: React.ReactNode; wide?: boolean; tall?: boolean }) {
  return <kbd className={`keycap ${wide ? "wide" : ""} ${tall ? "tall" : ""}`}>{children}</kbd>;
}

interface Group {
  title: string;
  keys: React.ReactNode;
  action: string;
}

const GROUPS: Group[] = [
  {
    title: "Fly",
    keys: (
      <div className="cluster">
        <div className="row">
          <Key>W</Key>
        </div>
        <div className="row">
          <Key>A</Key>
          <Key>S</Key>
          <Key>D</Key>
        </div>
      </div>
    ),
    action: "W thrust forward, S brake and reverse, A and D rotate. The arrow keys do the same.",
  },
  {
    title: "Strafe",
    keys: (
      <div className="row">
        <Key>Q</Key>
        <Key>E</Key>
      </div>
    ),
    action: "Slide left or right without turning. Useful for dodging shells and lining up a gun run.",
  },
  {
    title: "Fire",
    keys: (
      <div className="row">
        <Key wide>Space</Key>
        <Key>Shift</Key>
      </div>
    ),
    action: "Fire the selected weapon. Hold for the chain gun.",
  },
  {
    title: "Weapons",
    keys: (
      <div className="row">
        <Key>1</Key>
        <Key>2</Key>
        <Key>3</Key>
        <Key wide>Tab</Key>
      </div>
    ),
    action: "1 chain gun, 2 Hydra rockets, 3 Hellfire missiles. Tab cycles. Hellfires lock the nearest target in a forward cone.",
  },
  {
    title: "Flares",
    keys: (
      <div className="row">
        <Key>F</Key>
        <Key wide>Ctrl</Key>
      </div>
    ),
    action: "Drop a spread of flares. Missiles locked on you chase them instead and burst harmlessly. Six per aircraft, ammo crates add three.",
  },
  {
    title: "Winch",
    keys: (
      <div className="row">
        <Key wide>hover</Key>
      </div>
    ),
    action: "Slow to a hover over a crate or a POW and the winch engages on its own. The cabin holds six. Unload at the landing zone, which also refuels and repairs.",
  },
  {
    title: "Camera",
    keys: (
      <div className="row">
        <Key wide>wheel</Key>
      </div>
    ),
    action: "Mouse wheel zooms in and out.",
  },
  {
    title: "Game",
    keys: (
      <div className="row">
        <Key>Esc</Key>
        <Key>P</Key>
        <Key>M</Key>
      </div>
    ),
    action: "Esc or P pauses, M mutes. Enter confirms on menus.",
  },
];

export default function ControlsOverlay({ onClose }: { onClose: () => void }) {
  return (
    <div className="screen dim">
      <div className="card controls-card">
        <div className="eyebrow">CONTROLS</div>
        <div className="controls-grid">
          {GROUPS.map((g) => (
            <div key={g.title} className="control-group">
              <div className="control-title">{g.title}</div>
              <div className="control-keys">{g.keys}</div>
              <p className="control-action">{g.action}</p>
            </div>
          ))}
        </div>
        <button className="btn primary" onClick={onClose}>
          BACK <span className="key">Esc</span>
        </button>
      </div>
    </div>
  );
}
