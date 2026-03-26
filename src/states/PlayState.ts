import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { Engine } from "@babylonjs/core/Engines/engine";
import type { Scene } from "@babylonjs/core/scene";
import { Tuning } from "../config/tuning";
import type { OrthoCameraRig } from "../engine/createOrthoCameraRig";
import { createSceneBase } from "../engine/createSceneBase";
import { createOrthoArcRotateCameraRig } from "../engine/createOrthoCameraRig";
import type { GameState, StateContext } from "../game/StateManager";
import { mountHud } from "../ui/hud";
import type { HudMount } from "../ui/hud";
import { PlayerController } from "../player/PlayerController";
import { clearUiRoot } from "../ui/uiRoot";
import { Runtime } from "../config/runtimeConfig";
import { Action } from "../input/actions";
import type { Patient, Staff, Room, RoomId } from "../hospital/types";
import { createNameTag, disposeNameTagUI } from "../ui/nameTag";
import type { NameTag } from "../ui/nameTag";

// ─────────────────────────────────────────────────────────────────────────────
// Stub interfaces for P2 and P3 systems (replace with real imports once ready)
// ─────────────────────────────────────────────────────────────────────────────

// P2: HospitalLayout — uncomment and import once P2 pushes their module
// import { HospitalLayout } from "../world/HospitalLayout";

// P3: CharacterPhysics — uncomment and import once P3 pushes their module
// import { CharacterPhysics } from "../physics/CharacterPhysics";

// ─────────────────────────────────────────────────────────────────────────────
// Temporary room positions (P2 will replace with HospitalLayout)
// ─────────────────────────────────────────────────────────────────────────────

function createStubRooms(): Room[] {
  return [
    {
      id: "reception",
      position: new Vector3(0, 0, -10),
      entryPoint: new Vector3(0, 0, -8),
      occupied: false,
      occupantId: null,
    },
    {
      id: "waiting",
      position: new Vector3(-8, 0, 0),
      entryPoint: new Vector3(-6, 0, 0),
      occupied: false,
      occupantId: null,
    },
    {
      id: "patient_room_1",
      position: new Vector3(8, 0, 4),
      entryPoint: new Vector3(6, 0, 4),
      occupied: false,
      occupantId: null,
    },
    {
      id: "patient_room_2",
      position: new Vector3(8, 0, -4),
      entryPoint: new Vector3(6, 0, -4),
      occupied: false,
      occupantId: null,
    },
    {
      id: "doctor_office",
      position: new Vector3(-8, 0, 8),
      entryPoint: new Vector3(-6, 0, 8),
      occupied: false,
      occupantId: null,
    },
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// Simple NPC controller (moves toward target, used until P3 has full physics)
// ─────────────────────────────────────────────────────────────────────────────

interface NpcAgent {
  data: Patient | Staff;
  root: TransformNode;
  moveTarget: Vector3 | null;
  speed: number;
  stateTimer: number; // generic timer for current action
}

// ─────────────────────────────────────────────────────────────────────────────
// PlayState
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Nurse grab state: player directly controls a nurse who can auto-attach patients
// ─────────────────────────────────────────────────────────────────────────────

interface NurseGrabState {
  nurseAgent: NpcAgent;
  nurseData: Staff;
  attachedPatientAgent: NpcAgent | null;
  attachedPatientData: Patient | null;
}

export class PlayState implements GameState {
  readonly key = "play";
  private scene: Scene | null = null;
  private hud: HudMount | null = null;
  private player: PlayerController | null = null;
  private cameraRig: OrthoCameraRig | null = null;

  private npcAgents: NpcAgent[] = [];
  private obstacles: { center: Vector3; radius: number }[] = [];
  private nameTags = new Map<string, NameTag>();

  /** When non-null, the player is directly controlling a nurse. */
  private nurseGrab: NurseGrabState | null = null;

  constructor(private readonly engine: Engine) {}

  async enter(ctx: StateContext) {
    clearUiRoot();

    if (Runtime.e2e) {
      document.documentElement.dataset.jkReady = "0";
    }

    const scene = createSceneBase(this.engine);
    this.scene = scene;

    // ─── Camera ──────────────────────────────────────────────────────────
    this.cameraRig?.teardown();
    this.cameraRig = createOrthoArcRotateCameraRig({
      engine: this.engine,
      scene,
      target: new Vector3(0, 0, 0),
      alpha: Tuning.cameraAlpha,
      beta: Tuning.cameraBeta,
      radius: Tuning.cameraRadius,
      orthoHalfSize: Tuning.cameraOrthoHalfSize,
      betaLimits: { min: 0.35, max: 1.35 },
    });
    const camera = this.cameraRig.camera;

    // ─── Lighting ────────────────────────────────────────────────────────
    scene.clearColor = new Color4(0.85, 0.92, 0.95, 1); // hospital white-blue

    const hemiLight = new HemisphericLight("hemiLight", new Vector3(0, 1, 0), scene);
    hemiLight.intensity = 0.5;
    hemiLight.groundColor = new Color3(0.4, 0.4, 0.45);

    const sunLight = new DirectionalLight(
      "sunLight",
      new Vector3(-0.5, -1, -0.3).normalize(),
      scene,
    );
    sunLight.intensity = 0.8;
    sunLight.position = new Vector3(10, 20, 10);

    const shadowGenerator = new ShadowGenerator(1024, sunLight);
    shadowGenerator.useBlurExponentialShadowMap = true;
    shadowGenerator.blurKernel = 32;
    shadowGenerator.darkness = 0.3;
    (scene as any)._shadowGenerator = shadowGenerator;

    // ─── Ground / pick plane ─────────────────────────────────────────────
    const floorWidth = Tuning.hospitalFloorWidth;
    const floorDepth = Tuning.hospitalFloorDepth;

    const floor = MeshBuilder.CreateGround(
      "hospitalFloor",
      { width: floorWidth, height: floorDepth },
      scene,
    );
    const floorMat = new StandardMaterial("floorMat", scene);
    floorMat.diffuseColor = new Color3(0.9, 0.92, 0.88); // linoleum
    floorMat.specularColor = new Color3(0.1, 0.1, 0.1);
    floor.material = floorMat;
    floor.receiveShadows = true;
    floor.isPickable = true;

    // ─── Stub room markers (P2 will replace with real geometry) ──────────
    const rooms = createStubRooms();

    const markerMat = new StandardMaterial("roomMarker", scene);
    markerMat.diffuseColor = new Color3(0.3, 0.6, 0.9);
    markerMat.alpha = 0.4;

    for (const room of rooms) {
      const marker = MeshBuilder.CreateBox(
        `room_${room.id}`,
        { width: 5, height: 0.05, depth: 5 },
        scene,
      );
      marker.position.copyFrom(room.position);
      marker.position.y = 0.03;
      marker.material = markerMat;
      marker.isPickable = false;

      // Room label
      // (P2 will replace with proper signage)
    }

    // ─── Player ──────────────────────────────────────────────────────────
    const playerRoot = new TransformNode("playerRoot", scene);
    playerRoot.position = new Vector3(0, 0, -5);

    // Temp player visual (box) until P2 provides character meshes
    const playerBox = MeshBuilder.CreateBox("playerVisual", { size: 0.8 }, scene);
    playerBox.parent = playerRoot;
    playerBox.position.y = 0.4;
    const playerMat = new StandardMaterial("playerMat", scene);
    playerMat.diffuseColor = new Color3(0.2, 0.8, 0.3);
    playerBox.material = playerMat;
    shadowGenerator.addShadowCaster(playerBox);

    this.player = new PlayerController({
      root: playerRoot,
      moveSpeed: Tuning.playerMoveSpeed,
      arrivalThreshold: Tuning.playerArrivalThreshold,
    });
    this.player.setColliders({ obstacles: this.obstacles, playerRadius: Tuning.playerColliderRadius });

    // ─── Move marker ─────────────────────────────────────────────────────
    const moveMarker = MeshBuilder.CreateDisc(
      "moveMarker",
      { radius: 0.3, tessellation: 24 },
      scene,
    );
    moveMarker.rotation.x = Math.PI / 2;
    moveMarker.position = new Vector3(0, 0.01, 0);
    moveMarker.isVisible = false;
    const moveMarkerMat = new StandardMaterial("moveMarkerMat", scene);
    moveMarkerMat.emissiveColor = new Color3(0.2, 0.9, 1.0);
    moveMarkerMat.alpha = 0.6;
    moveMarker.material = moveMarkerMat;

    // ─── HUD ─────────────────────────────────────────────────────────────
    ctx.model.resetRun();

    // Rooms must be set AFTER resetRun() since resetRun() clears the rooms array
    ctx.model.rooms = rooms;
    this._modelRooms = rooms;

    this.hud = mountHud();
    this.hud.setMoney(ctx.model.money);
    this.hud.setReputation(ctx.model.reputation);
    this.hud.setTimer(ctx.model.shiftTimeLeft);

    // ─── Spawn initial staff (stub NPCs) ─────────────────────────────────
    this.spawnStubStaff(ctx, scene, shadowGenerator);

    // ─── Main game loop ──────────────────────────────────────────────────
    scene.onBeforeRenderObservable.add(() => {
      const dt = scene.getEngine().getDeltaTime() / 1000;

      // ─ Shift timer ─
      ctx.model.shiftTimeLeft -= dt;
      if (ctx.model.shiftTimeLeft <= 0) {
        ctx.model.shiftTimeLeft = 0;
        // TODO: transition to results state
      }

      // ─ Keyboard movement (camera-relative) ─
      const axis = ctx.input.getMoveAxis();
      const controlTarget = this.nurseGrab?.nurseAgent ?? null;
      if (axis.x !== 0 || axis.y !== 0) {
        const forward = camera.getTarget().subtract(camera.position).normalize();
        forward.y = 0;
        if (forward.lengthSquared() > 1e-6) forward.normalize();
        const right = Vector3.Cross(Vector3.Up(), forward);
        if (right.lengthSquared() > 1e-6) right.normalize();
        const dir = right.scale(axis.x).add(forward.scale(axis.y));
        if (controlTarget) {
          // Keyboard moves the controlled nurse
          controlTarget.moveTarget = null;
          const step = Tuning.nurseControlSpeed * dt;
          controlTarget.root.position.addInPlace(dir.scale(step));
          const yaw = Math.atan2(dir.x, dir.z);
          controlTarget.root.rotationQuaternion = null;
          controlTarget.root.rotation = new Vector3(0, yaw, 0);
        } else if (this.player) {
          this.player.setMoveDirection(dir);
        }
      } else if (!controlTarget && this.player) {
        this.player.setMoveDirection(null);
      }

      // ─ Drag-to-look ─
      const look = ctx.input.consumeLookDragDelta();
      if (look.dx !== 0 || look.dy !== 0) {
        camera.alpha -= look.dx * Tuning.cameraDragSensitivity;
        camera.beta -= look.dy * Tuning.cameraDragSensitivity;
      }

      // ─ Tap interaction ─
      const taps = ctx.input.consumeTaps();
      if (taps.length > 0) {
        const tap = taps.at(-1);
        if (tap) {
          const pointerPos = this.getPointerScenePosition(tap.clientX, tap.clientY);
          if (pointerPos) {
            const pick = scene.pick(pointerPos.x, pointerPos.y, (m) => m === floor);
            const groundPoint = (pick?.hit && pick.pickedPoint) ? pick.pickedPoint : null;

            if (this.nurseGrab) {
              // Currently controlling a nurse
              if (groundPoint) {
                // Check if tapping on another nurse to switch, or on ground to move
                const tappedNurse = this.findNurseNearPoint(groundPoint, ctx);
                if (tappedNurse && tappedNurse.nurseAgent !== this.nurseGrab.nurseAgent) {
                  // Release current, grab new nurse
                  this.releaseNurse(ctx);
                  this.grabNurse(tappedNurse.nurseAgent, tappedNurse.nurseData, ctx);
                } else {
                  // Move nurse to tapped point
                  this.nurseGrab.nurseAgent.moveTarget = groundPoint.clone();
                  moveMarker.position.x = groundPoint.x;
                  moveMarker.position.z = groundPoint.z;
                  moveMarker.isVisible = true;
                }
              }
            } else {
              // Not controlling anyone — check if tapping a nurse
              if (groundPoint) {
                const tappedNurse = this.findNurseNearPoint(groundPoint, ctx);
                if (tappedNurse) {
                  this.grabNurse(tappedNurse.nurseAgent, tappedNurse.nurseData, ctx);
                  this.hud?.showAlert(`Controlling ${tappedNurse.nurseData.id}! Tap ground to move.`);
                } else {
                  // Normal tap-to-move for player
                  this.player?.setMoveTarget(groundPoint);
                  moveMarker.position.x = groundPoint.x;
                  moveMarker.position.z = groundPoint.z;
                  moveMarker.isVisible = true;
                }
              }
            }
          }
        }
      }

      this.player?.update(scene);

      // Hide move marker when current controlled entity arrives
      if (this.nurseGrab) {
        if (!this.nurseGrab.nurseAgent.moveTarget) {
          moveMarker.isVisible = false;
        }
      } else if (this.player && !this.player.isMoving()) {
        moveMarker.isVisible = false;
      }

      // ─ Nurse grab: auto-attach nearby patients + tether ─
      this.updateNurseGrab(ctx, dt);

      // ─ Escape to release nurse ─
      if (this.nurseGrab && ctx.input.wasPressed(Action.Pause)) {
        this.releaseNurse(ctx);
        this.hud?.showAlert("Released nurse.");
      }

      // ─ Patient spawning ─
      const newPatient = ctx.model.tickSpawner(dt);
      if (newPatient) {
        this.spawnPatientNpc(newPatient, scene, shadowGenerator);
        this.hud?.showAlert(`New patient: ${newPatient.id}`);
      }

      // ─ Update NPC agents ─
      this.updateAgents(ctx, dt);

      // ─ Patience decay for waiting patients ─
      for (const p of ctx.model.patients) {
        if (p.state === "waiting" || p.state === "reception") {
          p.patience -= Tuning.patientPatienceDecayPerSec * dt;
          if (p.patience <= 0) {
            p.patience = 0;
            p.state = "exiting";
            // Free any room that was reserved for this patient
            const reservedRoom = ctx.model.rooms.find((r) => r.occupantId === p.id);
            if (reservedRoom) {
              reservedRoom.occupied = false;
              reservedRoom.occupantId = null;
            }
            // Free any nurse assigned to this patient
            const assignedNurse = ctx.model.staff.find(
              (s) => s.assignedPatient === p.id && s.role === "nurse",
            );
            if (assignedNurse) {
              assignedNurse.state = "idle";
              assignedNurse.assignedPatient = null;
            }
            ctx.model.addMoney(-Tuning.angryPatientPenalty);
            this.hud?.showAlert(`${p.id} left angry! -$${Tuning.angryPatientPenalty}`);
          }
        }
        // Update patient name tag based on state
        const tag = this.nameTags.get(p.id);
        if (tag) {
          if (p.dangerous) {
            tag.update("DANGEROUS", "#D93636");
          } else if (p.patience < 0.3) {
            tag.update("ANGRY", "#D93636");
          } else if (p.state === "in_treatment") {
            tag.update("TREATING", "#4A7FDB");
          } else if (p.state === "escorted" && this.nurseGrab?.attachedPatientData?.id === p.id) {
            tag.update("GRABBED", "#00FF88");
          } else if (p.state === "nurse_coming" || p.state === "escorted") {
            tag.update("ESCORTED", "#D4A017");
          } else if (p.state === "waiting") {
            tag.update("WAITING", "#A8A8A8");
          } else {
            tag.update("PATIENT", "#6BBF7A");
          }
        }
      }

      // ─ Update staff name tags ─
      for (const s of ctx.model.staff) {
        const tag = this.nameTags.get(s.id);
        if (tag) {
          if (s.state === "working" && s.assignedPatient) {
            tag.update(`${s.role.toUpperCase()} (BUSY)`, "#D4A017");
          } else {
            tag.update(s.role.toUpperCase(), s.role === "doctor" ? "#4A7FDB" : s.role === "nurse" ? "#FFFFFF" : "#DAB24E");
          }
        }
      }

      // ─ Update HUD ─
      this.hud?.setMoney(ctx.model.money);
      this.hud?.setReputation(ctx.model.reputation);
      this.hud?.setTimer(ctx.model.shiftTimeLeft);
      this.hud?.setPatientCount(ctx.model.getActivePatients().length);
    });

    if (Runtime.e2e) {
      document.documentElement.dataset.jkReady = "1";
    }
  }

  exit() {
    this.nurseGrab = null;
    this.cameraRig?.teardown();
    this.cameraRig = null;
    this.hud?.teardown();
    this.hud = null;
    this.player = null;
    this.npcAgents = [];
    this.obstacles = [];
    for (const tag of this.nameTags.values()) tag.dispose();
    this.nameTags.clear();
    disposeNameTagUI();
    this.scene = null;
  }

  getScene(): Scene | null {
    return this.scene;
  }

  getPlayerPosition() {
    return this.player?.getPosition() ?? null;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // NPC spawning (stub visuals — P2 replaces with CharacterFactory)
  // ─────────────────────────────────────────────────────────────────────────

  private spawnStubStaff(ctx: StateContext, scene: Scene, sg: ShadowGenerator) {
    const roles: Array<{ role: Staff["role"]; color: Color3; pos: Vector3; mass: number }> = [
      { role: "receptionist", color: new Color3(0.9, 0.7, 0.2), pos: new Vector3(0, 0, -10), mass: Tuning.defaultMass },
      { role: "nurse", color: new Color3(1, 1, 1), pos: new Vector3(-3, 0, 0), mass: Tuning.defaultMass },
      { role: "nurse", color: new Color3(1, 1, 1), pos: new Vector3(-4, 0, 2), mass: Tuning.defaultMass },
      { role: "doctor", color: new Color3(0.3, 0.5, 0.9), pos: new Vector3(-8, 0, 8), mass: Tuning.defaultMass },
      { role: "doctor", color: new Color3(0.3, 0.5, 0.9), pos: new Vector3(-6, 0, 8), mass: Tuning.defaultMass },
    ];

    let staffIdx = 0;
    for (const def of roles) {
      const id = `${def.role}_${staffIdx++}`;
      const root = new TransformNode(id, scene);
      root.position.copyFrom(def.pos);

      const box = MeshBuilder.CreateBox(`${id}_vis`, { size: 0.7 }, scene);
      box.parent = root;
      box.position.y = 0.35;
      const mat = new StandardMaterial(`${id}_mat`, scene);
      mat.diffuseColor = def.color;
      box.material = mat;
      sg.addShadowCaster(box);

      const staff: Staff = {
        id,
        role: def.role,
        state: "idle",
        target: null,
        assignedPatient: null,
        mesh: root,
        mass: def.mass,
      };
      ctx.model.staff.push(staff);

      this.npcAgents.push({
        data: staff,
        root,
        moveTarget: null,
        speed: def.role === "nurse" ? Tuning.nurseMoveSpeed :
               def.role === "doctor" ? Tuning.doctorMoveSpeed :
               Tuning.npcMoveSpeed,
        stateTimer: 0,
      });

      const tag = createNameTag(scene, root, def.role.toUpperCase(), def.role);
      this.nameTags.set(id, tag);
    }
  }

  private spawnPatientNpc(patient: Patient, scene: Scene, sg: ShadowGenerator) {
    const root = new TransformNode(patient.id, scene);
    // Patients enter from the bottom of the map
    root.position = new Vector3(
      -2 + Math.random() * 4,
      0,
      -(Tuning.hospitalFloorDepth / 2) + 1,
    );
    patient.mesh = root;

    const box = MeshBuilder.CreateBox(`${patient.id}_vis`, { size: 0.6 }, scene);
    box.parent = root;
    box.position.y = 0.3;
    const mat = new StandardMaterial(`${patient.id}_mat`, scene);
    mat.diffuseColor = patient.dangerous
      ? new Color3(0.9, 0.2, 0.2)
      : new Color3(0.7, 0.85, 0.7);
    box.material = mat;
    sg.addShadowCaster(box);

    const agent: NpcAgent = {
      data: patient,
      root,
      moveTarget: null,
      speed: Tuning.patientMoveSpeed,
      stateTimer: 0,
    };

    // Start by moving toward reception
    const receptionRoom = this.findRoom("reception");
    if (receptionRoom) {
      agent.moveTarget = receptionRoom.entryPoint.clone();
      patient.state = "entering";
    }

    this.npcAgents.push(agent);

    const role = patient.dangerous ? "dangerous" : "patient";
    const label = patient.dangerous ? "DANGEROUS" : "PATIENT";
    const tag = createNameTag(scene, root, label, role);
    this.nameTags.set(patient.id, tag);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Agent update loop (simple state-driven movement)
  // ─────────────────────────────────────────────────────────────────────────

  private updateAgents(ctx: StateContext, dt: number) {
    const grabbedNurseId = this.nurseGrab?.nurseData.id ?? null;
    const tetheredPatientId = this.nurseGrab?.attachedPatientData?.id ?? null;

    for (const agent of this.npcAgents) {
      // Skip movement for player-controlled nurse (player moves it directly)
      // Skip movement for tethered patient (tether handles position)
      const isGrabbedNurse = grabbedNurseId && agent.data.id === grabbedNurseId;
      const isTetheredPatient = tetheredPatientId && agent.data.id === tetheredPatientId;

      // Grabbed nurse still moves toward tap targets; tethered patient is positioned by tether
      if (!isTetheredPatient && agent.moveTarget) {
        const pos = agent.root.position;
        const to = agent.moveTarget.subtract(pos);
        to.y = 0;
        const dist = to.length();

        if (dist < Tuning.npcArrivalThreshold) {
          agent.moveTarget = null;
        } else {
          const dir = to.scale(1 / Math.max(dist, 1e-6));
          const speed = isGrabbedNurse ? Tuning.nurseControlSpeed : agent.speed;
          const step = Math.min(dist, speed * dt);
          pos.addInPlace(dir.scale(step));

          const yaw = Math.atan2(dir.x, dir.z);
          agent.root.rotationQuaternion = null;
          agent.root.rotation = new Vector3(0, yaw, 0);
        }
      }

      // Patient pipeline logic (skip for tethered patient — player decides where they go)
      if (this.isPatient(agent.data) && !isTetheredPatient) {
        this.tickPatientPipeline(ctx, agent, dt);
      }

      // Staff AI logic (skip for player-controlled nurse)
      if (this.isStaff(agent.data) && !isGrabbedNurse) {
        this.tickStaffAi(ctx, agent, dt);
      }
    }

    // Clean up exited patients
    this.cleanupGonePatients(ctx);
  }

  private tickPatientPipeline(ctx: StateContext, agent: NpcAgent, dt: number) {
    const patient = agent.data as Patient;

    switch (patient.state) {
      case "entering":
        // Moving to reception — handled by moveTarget; transitions when arrived
        if (!agent.moveTarget) {
          patient.state = "reception";
          agent.stateTimer = Tuning.receptionCheckDurationSec;
        }
        break;

      case "reception":
        agent.stateTimer -= dt;
        if (agent.stateTimer <= 0) {
          // Auto-accept (later: receptionist AI decides)
          patient.state = "waiting";
          const waitRoom = this.findRoom("waiting");
          if (waitRoom) {
            agent.moveTarget = waitRoom.entryPoint.clone();
            // Randomize slightly so patients don't stack
            agent.moveTarget.x += (Math.random() - 0.5) * 3;
            agent.moveTarget.z += (Math.random() - 0.5) * 3;
          }
        }
        break;

      case "waiting": {
        // Try to get a nurse + free room
        const freeRoom = ctx.model.findFreeRoom();
        const nurse = ctx.model.findIdleStaff("nurse");
        if (freeRoom && nurse) {
          freeRoom.occupied = true;
          freeRoom.occupantId = patient.id;
          patient.assignedRoom = freeRoom.id;
          patient.state = "nurse_coming";
          nurse.state = "working";
          nurse.assignedPatient = patient.id;

          // Send nurse to walk to the patient's current position
          const nurseAgent = this.npcAgents.find((a) => a.data.id === nurse.id);
          if (nurseAgent) {
            nurseAgent.moveTarget = agent.root.position.clone();
          }
        }
        break;
      }

      case "nurse_coming": {
        // Wait for nurse to arrive at patient
        const escortNurse = ctx.model.staff.find(
          (s) => s.assignedPatient === patient.id && s.role === "nurse",
        );
        if (!escortNurse) break;
        const nurseAgent = this.npcAgents.find((a) => a.data.id === escortNurse.id);
        if (!nurseAgent) break;

        const nurseDist = Vector3.Distance(
          nurseAgent.root.position,
          agent.root.position,
        );

        // Keep chasing the patient — they may still be walking to the waiting room
        if (!nurseAgent.moveTarget && nurseDist >= 1.0) {
          nurseAgent.moveTarget = agent.root.position.clone();
        }

        if (nurseDist < 1.0) {
          // Nurse arrived — both walk to the room together
          patient.state = "escorted";
          const room = ctx.model.rooms.find((r) => r.id === patient.assignedRoom);
          if (room) {
            agent.moveTarget = room.entryPoint.clone();
            nurseAgent.moveTarget = room.entryPoint.clone();
          }
        }
        break;
      }

      case "escorted": {
        // Patient and nurse walking to room together
        if (!agent.moveTarget) {
          // Patient arrived at room
          patient.state = "assigned";
        }
        break;
      }

      case "assigned": {
        // Arrived at room — free nurse, assign doctor
        patient.state = "in_treatment";
        agent.stateTimer = Tuning.treatmentDurationSec;

        // Free up the nurse
        const assignedNurse = ctx.model.staff.find(
          (s) => s.assignedPatient === patient.id && s.role === "nurse",
        );
        if (assignedNurse) {
          assignedNurse.state = "idle";
          assignedNurse.assignedPatient = null;
        }

        // Assign a doctor
        const doctor = ctx.model.findIdleStaff("doctor");
        if (doctor) {
          doctor.state = "working";
          doctor.assignedPatient = patient.id;
          patient.assignedDoctor = doctor.id;

          // Move doctor to the room
          const doctorAgent = this.npcAgents.find((a) => a.data.id === doctor.id);
          const room = ctx.model.rooms.find((r) => r.id === patient.assignedRoom);
          if (doctorAgent && room) {
            doctorAgent.moveTarget = room.entryPoint.clone();
          }
        }
        break;
      }

      case "in_treatment":
        agent.stateTimer -= dt;
        if (agent.stateTimer <= 0) {
          const success = ctx.model.resolveTreatment(patient.id);
          if (success) {
            this.hud?.showAlert(`${patient.id} healed! +$$$`);
          } else {
            this.hud?.showAlert(`${patient.id} treatment failed! Lawsuit!`);
          }
          // Free the room
          const room = ctx.model.rooms.find((r) => r.id === patient.assignedRoom);
          if (room) {
            room.occupied = false;
            room.occupantId = null;
          }
          // Free the doctor
          if (patient.assignedDoctor) {
            const doc = ctx.model.getStaffById(patient.assignedDoctor);
            if (doc) {
              doc.state = "idle";
              doc.assignedPatient = null;
            }
          }
          // Move patient to exit
          agent.moveTarget = new Vector3(
            0,
            0,
            -(Tuning.hospitalFloorDepth / 2) - 2,
          );
        }
        break;

      case "exiting":
        if (!agent.moveTarget) {
          // Set exit target if not set
          agent.moveTarget = new Vector3(
            0,
            0,
            -(Tuning.hospitalFloorDepth / 2) - 2,
          );
        }
        if (
          agent.root.position.z < -(Tuning.hospitalFloorDepth / 2) - 1
        ) {
          patient.state = "gone";
        }
        break;

      default:
        break;
    }
  }

  private tickStaffAi(_ctx: StateContext, agent: NpcAgent, _dt: number) {
    const staff = agent.data as Staff;
    // Receptionist stays at reception
    if (staff.role === "receptionist" && staff.state === "idle" && !agent.moveTarget) {
      const recRoom = this.findRoom("reception");
      if (recRoom) {
        const dist = Vector3.Distance(agent.root.position, recRoom.position);
        if (dist > 1.5) {
          agent.moveTarget = recRoom.position.clone();
        }
      }
    }

    // Doctor returns to office when idle
    if (staff.role === "doctor" && staff.state === "idle" && !agent.moveTarget) {
      const office = this.findRoom("doctor_office");
      if (office) {
        const dist = Vector3.Distance(agent.root.position, office.position);
        if (dist > 1.5) {
          agent.moveTarget = office.position.clone();
        }
      }
    }

    // Nurses return to waiting area when idle
    if (staff.role === "nurse" && staff.state === "idle" && !agent.moveTarget) {
      const waitRoom = this.findRoom("waiting");
      if (waitRoom) {
        const dist = Vector3.Distance(agent.root.position, waitRoom.position);
        if (dist > 2) {
          agent.moveTarget = waitRoom.position.clone();
        }
      }
    }

    // If staff finished working (arrived at destination), reset to idle
    if (staff.state === "working" && !staff.assignedPatient && !agent.moveTarget) {
      staff.state = "idle";
    }
  }

  private cleanupGonePatients(ctx: StateContext) {
    const gone = ctx.model.patients.filter((p) => p.state === "gone");
    for (const p of gone) {
      this.nameTags.get(p.id)?.dispose();
      this.nameTags.delete(p.id);

      const agentIdx = this.npcAgents.findIndex((a) => a.data.id === p.id);
      if (agentIdx !== -1) {
        const agent = this.npcAgents[agentIdx]!;
        agent.root.dispose();
        this.npcAgents.splice(agentIdx, 1);
      }
    }
    ctx.model.patients = ctx.model.patients.filter((p) => p.state !== "gone");
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────────────────

  private _modelRooms: Room[] = [];

  private findRoom(id: RoomId): Room | undefined {
    return this._modelRooms.find((r) => r.id === id);
  }

  private isPatient(data: Patient | Staff): data is Patient {
    return "diagnosis" in data;
  }

  private isStaff(data: Patient | Staff): data is Staff {
    return "role" in data;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Nurse grab system
  // ─────────────────────────────────────────────────────────────────────────

  private findNurseNearPoint(
    worldPoint: Vector3,
    ctx: StateContext,
  ): { nurseAgent: NpcAgent; nurseData: Staff } | null {
    let bestDist: number = Tuning.npcPickRadius;
    let best: { nurseAgent: NpcAgent; nurseData: Staff } | null = null;

    for (const agent of this.npcAgents) {
      if (!this.isStaff(agent.data)) continue;
      if (agent.data.role !== "nurse") continue;
      const dist = Vector3.Distance(
        new Vector3(agent.root.position.x, 0, agent.root.position.z),
        new Vector3(worldPoint.x, 0, worldPoint.z),
      );
      if (dist < bestDist) {
        bestDist = dist;
        best = { nurseAgent: agent, nurseData: agent.data as Staff };
      }
    }
    return best;
  }

  private grabNurse(nurseAgent: NpcAgent, nurseData: Staff, _ctx: StateContext) {
    // Pause nurse AI — player takes over movement
    nurseAgent.moveTarget = null;
    nurseData.state = "working";

    this.nurseGrab = {
      nurseAgent,
      nurseData,
      attachedPatientAgent: null,
      attachedPatientData: null,
    };

    // Visual feedback: highlight the nurse
    const tag = this.nameTags.get(nurseData.id);
    if (tag) {
      tag.update("NURSE (YOU)", "#00FF88");
    }
  }

  private releaseNurse(ctx: StateContext) {
    if (!this.nurseGrab) return;

    const { nurseAgent, nurseData, attachedPatientAgent, attachedPatientData } = this.nurseGrab;

    // If carrying a patient, check if we dropped them near a patient room
    if (attachedPatientAgent && attachedPatientData) {
      const droppedAt = attachedPatientAgent.root.position;
      let droppedInRoom: Room | null = null;

      for (const room of this._modelRooms) {
        if (room.id === "reception" || room.id === "waiting") continue;
        const dist = Vector3.Distance(droppedAt, room.position);
        if (dist < 3.5) {
          droppedInRoom = room;
          break;
        }
      }

      if (droppedInRoom && !droppedInRoom.occupied) {
        // Dropped patient in a free room — fast-track to treatment
        droppedInRoom.occupied = true;
        droppedInRoom.occupantId = attachedPatientData.id;
        attachedPatientData.assignedRoom = droppedInRoom.id;
        attachedPatientData.state = "assigned";
        attachedPatientAgent.moveTarget = null;
        this.hud?.showAlert(`Dropped ${attachedPatientData.id} in ${droppedInRoom.id}!`);
      } else if (droppedInRoom && droppedInRoom.occupied) {
        // Room is occupied — patient just stays where dropped, goes back to waiting
        attachedPatientData.state = "waiting";
        attachedPatientAgent.moveTarget = null;
        this.hud?.showAlert(`${droppedInRoom.id} is occupied! Patient waits here.`);
      } else {
        // Dropped in hallway — patient resumes waiting
        attachedPatientData.state = "waiting";
        attachedPatientAgent.moveTarget = null;
      }
    }

    // Free the nurse back to idle AI
    nurseData.state = "idle";
    nurseData.assignedPatient = null;
    nurseAgent.moveTarget = null;

    const tag = this.nameTags.get(nurseData.id);
    if (tag) {
      tag.update("NURSE", "#FFFFFF");
    }

    this.nurseGrab = null;
  }

  private updateNurseGrab(_ctx: StateContext, _dt: number) {
    if (!this.nurseGrab) return;

    const { nurseAgent, attachedPatientAgent } = this.nurseGrab;

    // Auto-attach: check for nearby patients that aren't already being treated
    if (!this.nurseGrab.attachedPatientAgent) {
      for (const agent of this.npcAgents) {
        if (!this.isPatient(agent.data)) continue;
        const patient = agent.data as Patient;
        // Only grab patients who are waiting or in reception or nurse_coming
        if (
          patient.state !== "waiting" &&
          patient.state !== "reception" &&
          patient.state !== "nurse_coming" &&
          patient.state !== "entering"
        ) continue;

        const dist = Vector3.Distance(
          nurseAgent.root.position,
          agent.root.position,
        );
        if (dist < Tuning.nurseGrabRadius) {
          // Attach!
          this.nurseGrab.attachedPatientAgent = agent;
          this.nurseGrab.attachedPatientData = patient;
          // Cancel any existing nurse assignment for this patient
          const prevNurse = _ctx.model.staff.find(
            (s) => s.assignedPatient === patient.id && s.role === "nurse" && s.id !== this.nurseGrab!.nurseData.id,
          );
          if (prevNurse) {
            prevNurse.state = "idle";
            prevNurse.assignedPatient = null;
          }
          patient.state = "escorted";
          agent.moveTarget = null; // will be tethered instead
          this.nurseGrab.nurseData.assignedPatient = patient.id;
          this.hud?.showAlert(`Grabbed ${patient.id}! Move to a room.`);
          break;
        }
      }
    }

    // Tether: patient follows nurse with an offset
    if (attachedPatientAgent) {
      const nursePos = nurseAgent.root.position;
      // Patient follows behind the nurse (opposite of nurse facing direction)
      const nurseYaw = nurseAgent.root.rotation?.y ?? 0;
      const offsetX = -Math.sin(nurseYaw) * Tuning.nurseTetherOffset;
      const offsetZ = -Math.cos(nurseYaw) * Tuning.nurseTetherOffset;
      const targetPos = new Vector3(
        nursePos.x + offsetX,
        0,
        nursePos.z + offsetZ,
      );
      // Smooth follow
      const patPos = attachedPatientAgent.root.position;
      patPos.x += (targetPos.x - patPos.x) * 0.15;
      patPos.z += (targetPos.z - patPos.z) * 0.15;

      // Face the nurse
      const toNurse = nursePos.subtract(patPos);
      toNurse.y = 0;
      if (toNurse.lengthSquared() > 0.01) {
        const yaw = Math.atan2(toNurse.x, toNurse.z);
        attachedPatientAgent.root.rotationQuaternion = null;
        attachedPatientAgent.root.rotation = new Vector3(0, yaw, 0);
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Escape key to release nurse
  // ─────────────────────────────────────────────────────────────────────────

  private getPointerScenePosition(clientX: number, clientY: number): { x: number; y: number } | null {
    const canvas = this.engine.getRenderingCanvas();
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    if (canvas.clientWidth <= 0 || canvas.clientHeight <= 0) return null;

    const scaleX = rect.width / canvas.clientWidth;
    const scaleY = rect.height / canvas.clientHeight;
    if (scaleX <= 0 || scaleY <= 0) return null;

    const x = (clientX - rect.left) / scaleX;
    const y = (clientY - rect.top) / scaleY;
    return { x, y };
  }
}
