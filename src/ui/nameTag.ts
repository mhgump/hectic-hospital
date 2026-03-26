import { AdvancedDynamicTexture } from "@babylonjs/gui/2D/advancedDynamicTexture";
import { TextBlock } from "@babylonjs/gui/2D/controls/textBlock";
import { Rectangle } from "@babylonjs/gui/2D/controls/rectangle";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";

let _guiTexture: AdvancedDynamicTexture | null = null;

function getOrCreateGui(scene: Scene): AdvancedDynamicTexture {
  if (!_guiTexture) {
    _guiTexture = AdvancedDynamicTexture.CreateFullscreenUI("nameTagUI", true, scene);
  }
  return _guiTexture;
}

export interface NameTag {
  update(label: string, bgColor: string): void;
  dispose(): void;
}

const TAG_COLORS: Record<string, string> = {
  doctor: "#4A7FDB",
  nurse: "#FFFFFF",
  receptionist: "#E0B028",
  patient: "#6BBF7A",
  dangerous: "#D93636",
};

export function createNameTag(
  scene: Scene,
  node: TransformNode,
  label: string,
  role: string,
): NameTag {
  const gui = getOrCreateGui(scene);

  const rect = new Rectangle(`tag_${node.name}`);
  rect.width = "110px";
  rect.height = "26px";
  rect.cornerRadius = 6;
  rect.color = "#222";
  rect.thickness = 1.5;
  rect.background = TAG_COLORS[role] ?? "#888";
  rect.alpha = 0.85;

  const text = new TextBlock();
  text.text = label;
  text.color = role === "nurse" ? "#333" : "#FFF";
  text.fontSize = 13;
  text.fontFamily = "Arial, sans-serif";
  text.fontWeight = "bold";
  rect.addControl(text);

  gui.addControl(rect);
  rect.linkWithMesh(node);
  rect.linkOffsetY = -55;

  return {
    update(newLabel: string, bgColor: string) {
      text.text = newLabel;
      rect.background = bgColor;
    },
    dispose() {
      gui.removeControl(rect);
      rect.dispose();
    },
  };
}

export function disposeNameTagUI() {
  _guiTexture?.dispose();
  _guiTexture = null;
}
