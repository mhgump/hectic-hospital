import { AnimationGroup } from "@babylonjs/core/Animations/animationGroup";

export type CharacterAnimatorOpts = {
  idle: AnimationGroup;
  walk: AnimationGroup;
};

export class CharacterAnimator {
  private readonly idle: AnimationGroup;
  private readonly walk: AnimationGroup;
  private moving = false;

  constructor(opts: CharacterAnimatorOpts) {
    this.idle = opts.idle;
    this.walk = opts.walk;
    this.idle.start(true);
  }

  dispose() {
    this.idle.dispose();
    this.walk.dispose();
  }

  setMoving(moving: boolean) {
    if (moving === this.moving) return;
    this.moving = moving;

    if (moving) {
      this.idle.stop();
      this.walk.start(true);
    } else {
      this.walk.stop();
      this.idle.start(true);
    }
  }
}
