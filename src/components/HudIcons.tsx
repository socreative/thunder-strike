"use client";

/** Small inline glyphs for the compact phone HUD. All 24 by 24, stroke in currentColor. */

const P = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;

export const ShieldIcon = () => (
  <svg viewBox="0 0 24 24" className="hicon">
    <path {...P} d="M12 3l7 3v5c0 4.5-3 8.2-7 10-4-1.8-7-5.5-7-10V6z" />
    <path {...P} d="M9 12l2 2 4-4" />
  </svg>
);

export const FuelIcon = () => (
  <svg viewBox="0 0 24 24" className="hicon">
    <path {...P} d="M5 21V5a2 2 0 012-2h6a2 2 0 012 2v16M4 21h12" />
    <path {...P} d="M7 7h6v4H7zM15 9l3 1v7a1.5 1.5 0 01-3 0" />
  </svg>
);

export const HeliIcon = () => (
  <svg viewBox="0 0 24 24" className="hicon">
    <path {...P} d="M12 4v16M3 6l18 12M21 6L3 18" strokeWidth={1.6} />
    <ellipse cx="12" cy="12" rx="3" ry="5.5" fill="currentColor" stroke="none" />
    <path {...P} d="M8 12h8M10 20h4" strokeWidth={1.6} />
  </svg>
);

export const PersonIcon = () => (
  <svg viewBox="0 0 24 24" className="hicon">
    <circle cx="12" cy="7" r="3.2" {...P} />
    <path {...P} d="M5.5 21a6.5 6.5 0 0113 0" />
  </svg>
);

export const GunIcon = () => (
  <svg viewBox="0 0 24 24" className="hicon">
    <path {...P} d="M4 10h13l3 2-3 2H9l-1 4H5l1-4H4z" />
    <path {...P} d="M17 10V7M13 10V6" strokeWidth={1.6} />
  </svg>
);

export const RocketIcon = () => (
  <svg viewBox="0 0 24 24" className="hicon">
    <path {...P} d="M12 2c2.5 2.5 3.5 6 3.5 9.5V17h-7v-5.5C8.5 8 9.5 4.5 12 2z" />
    <path {...P} d="M8.5 13l-3 3v3l3-2M15.5 13l3 3v3l-3-2M10 17l2 4 2-4" />
  </svg>
);

export const MissileIcon = () => (
  <svg viewBox="0 0 24 24" className="hicon">
    <path {...P} d="M3 15L15 3c2 0 4 2 4 4L7 19c-1.5 1.5-4 1.5-4-4z" />
    <path {...P} d="M7 19l-2 2M12.5 5.5L6 8l3 3M18.5 11.5L16 18l-3-3" />
  </svg>
);

export const BurstIcon = () => (
  <svg viewBox="0 0 24 24" className="hicon">
    <path {...P} d="M12 3v5M12 16v5M3 12h5M16 12h5M5.6 5.6l3.5 3.5M14.9 14.9l3.5 3.5M18.4 5.6l-3.5 3.5M9.1 14.9l-3.5 3.5" />
    <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
  </svg>
);
