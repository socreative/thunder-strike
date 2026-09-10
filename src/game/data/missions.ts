import type { MissionData } from "./mission";
import { mission1 } from "./mission1";
import { mission2 } from "./mission2";

/** Every mission in picker order. */
export const MISSIONS: MissionData[] = [mission1, mission2];

export function missionById(id: string): MissionData | undefined {
  return MISSIONS.find((m) => m.id === id);
}
