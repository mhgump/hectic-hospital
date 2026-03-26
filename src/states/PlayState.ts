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
import type { Patient, Staff, Room, RoomId } from "../hospital/types";

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

export class PlayState implements GameState {
  readonly key = "play";
  private scene: Scene | null = null;
  private hud: HudMount | null = null;
  private player: PlayerController | null = null;
  private cameraRig: OrthoCameraRig | null = null;

  private npcAgents: NpcAgent[] = [];
  private obstacles: { center: Vector3; radius: number }[] = [];

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
    ctx.model.rooms = rooms;
    this._modelRooms = rooms;

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
      if (this.player) {
        if (axis.x !== 0 || axis.y !== 0) {
          const forward = camera.getTarget().subtract(camera.position).normalize();
          forward.y = 0;
          if (forward.lengthSquared() > 1e-6) forward.normalize();
          const right = Vector3.Cross(Vector3.Up(), forward);
          if (right.lengthSquared() > 1e-6) right.normalize();
          const dir = right.scale(axis.x).add(forward.scale(axis.y));
          this.player.setMoveDirection(dir);
        } else {
          this.player.setMoveDirection(null);
        }
      }

      // ─ Drag-to-look ─
      const look = ctx.input.consumeLookDragDelta();
      if (look.dx !== 0 || look.dy !== 0) {
        camera.alpha -= look.dx * Tuning.cameraDragSensitivity;
        camera.beta -= look.dy * Tuning.cameraDragSensitivity;
      }

      // ─ Tap-to-move ─
      const taps = ctx.input.consumeTaps();
      if (taps.length > 0) {
        const tap = taps.at(-1);
        if (tap) {
          const pointerPos = this.getPointerScenePosition(tap.clientX, tap.clientY);
          if (pointerPos) {
            const pick = scene.pick(pointerPos.x, pointerPos.y, (m) => m === floor);
            if (pick?.hit && pick.pickedPoint) {
              this.player?.setMoveTarget(pick.pickedPoint);
              moveMarker.position.x = pick.pickedPoint.x;
              moveMarker.position.z = pick.pickedPoint.z;
              moveMarker.isVisible = true;
            }
          }
        }
      }

      this.player?.update(scene);

      // Hide move marker when player arrives
      if (this.player && !this.player.isMoving()) {
        moveMarker.isVisible = false;
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
            ctx.model.addMoney(-Tuning.angryPatientPenalty);
            this.hud?.showAlert(`${p.id} left angry! -$${Tuning.angryPatientPenalty}`);
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
    this.cameraRig?.teardown();
    this.cameraRig = null;
    this.hud?.teardown();
    this.hud = null;
    this.player = null;
    this.npcAgents = [];
    this.obstacles = [];
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
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Agent update loop (simple state-driven movement)
  // ─────────────────────────────────────────────────────────────────────────

  private updateAgents(ctx: StateContext, dt: number) {
    for (const agent of this.npcAgents) {
      // Move toward target
      if (agent.moveTarget) {
        const pos = agent.root.position;
        const to = agent.moveTarget.subtract(pos);
        to.y = 0;
        const dist = to.length();

        if (dist < Tuning.npcArrivalThreshold) {
          agent.moveTarget = null;
        } else {
          const dir = to.scale(1 / Math.max(dist, 1e-6));
          const step = Math.min(dist, agent.speed * dt);
          pos.addInPlace(dir.scale(step));

          const yaw = Math.atan2(dir.x, dir.z);
          agent.root.rotationQuaternion = null;
          agent.root.rotation = new Vector3(0, yaw, 0);
        }
      }

      // Patient pipeline logic
      if (this.isPatient(agent.data)) {
        this.tickPatientPipeline(ctx, agent, dt);
      }

      // Staff AI logic
      if (this.isStaff(agent.data)) {
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
        // Try to get assigned to a free room
        const freeRoom = ctx.model.findFreeRoom();
        const nurse = ctx.model.findIdleStaff("nurse");
        if (freeRoom && nurse) {
          freeRoom.occupied = true;
          freeRoom.occupantId = patient.id;
          patient.assignedRoom = freeRoom.id;
          patient.state = "assigned";
          nurse.state = "working";
          nurse.assignedPatient = patient.id;
          // Move patient to room
          agent.moveTarget = freeRoom.entryPoint.clone();
        }
        break;
      }

      case "assigned":
        if (!agent.moveTarget) {
          // Arrived at room, wait for doctor
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
        }
        break;

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
