/** A distinct model definition — one GLB is generated per unique id. */
export interface RoomModelDef {
  id: string;           // snake_case, unique within the room
  prompt: string;       // generation prompt (empty if existingModel is set)
  model: string | null; // path relative to public/ once generated
  collides: boolean;    // whether this model blocks player movement
}

/** One placement of a model in the room. Many placements can share one modelId. */
export interface RoomObjectPlacement {
  modelId: string;                    // references RoomModelDef.id
  position: [number, number, number]; // [x, y, z] — y is always 0
  rotationY: number;                  // degrees
  scale: number;                      // uniform scale
}

export interface RoomTexturePlacement {
  id: string;
  prompt: string;
  texture: string | null; // path relative to public/
  surface: "floor" | "north_wall" | "south_wall" | "east_wall" | "west_wall";
  uvOffset: [number, number]; // [u, v] 0..1 center position on the surface
  uvScale: [number, number];  // [s, s] uniform size fraction (use same value for both)
}

/** An empty tile adjacent to an interactive model where an NPC will stand. */
export interface RoomInteractionTile {
  forModelId: string;                 // the model this interaction tile belongs to
  position: [number, number, number]; // [x, y, z] tile center — y always 0
}

export interface HospitalRoom {
  id: string;
  name: string;
  prompt: string;
  createdAt: string;
  // Floor
  floorTexturePrompt: string;
  floorTexture: string | null;
  // Interior walls — single shared tileable texture for both north and west walls
  wallTexturePrompt: string;
  wallTexture: string | null;
  // Distinct model definitions (≤ 5); each generates one GLB reused across all placements
  models: RoomModelDef[];
  // All object placements — many placements may share one modelId
  placements: RoomObjectPlacement[];
  // Empty tiles adjacent to interactive models (for NPC standing positions)
  interactionTiles?: RoomInteractionTile[];
  // Decorative texture placements on walls / floor
  extraTextures: RoomTexturePlacement[];
}

export interface RoomsData {
  hallwayTexture: string | null;
  hallwayFloorTexture: string | null;
  rooms: HospitalRoom[];
}

export type AssetStatus = "pending" | "running" | "done" | "error" | "unknown";
export type StatusMap = Record<string, AssetStatus>;

export interface ServerStatusResponse {
  hallwayTexture: string | null;
  hallwayFloorTexture: string | null;
  rooms: HospitalRoom[];
  status: StatusMap;
  queueLength: number;
  activeTasks: string[];
}
