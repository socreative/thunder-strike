"use client";

import dynamic from "next/dynamic";

// three/webgpu touches browser globals at import time, so the whole game shell
// is client-only and never server rendered.
const GameShell = dynamic(() => import("./GameShell"), {
  ssr: false,
  loading: () => (
    <div className="boot">
      <div className="boot-title">THUNDER STRIKE</div>
      <div className="boot-sub">loading</div>
    </div>
  ),
});

export default function GameLoader() {
  return <GameShell />;
}
