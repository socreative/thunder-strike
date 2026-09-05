"use client";

import dynamic from "next/dynamic";

// three/webgpu touches browser globals at import time, so the whole game shell
// is client-only and never server rendered.
const GameShell = dynamic(() => import("./GameShell"), {
  ssr: false,
  loading: () => (
    <div className="boot">
      {/* Plain img: next/image is not worth loading before the bundle is up. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="boot-logo" src="/logo.webp" alt="Thunder Strike" />
      <div className="boot-sub">loading</div>
    </div>
  ),
});

export default function GameLoader() {
  return <GameShell />;
}
