import type { Patient, Staff, Room, HospitalEvent, Diagnosis } from "../hospital/types";

const DIAGNOSES: Diagnosis[] = ["flu", "broken_bone", "food_poisoning", "headache", "mystery_rash"];

let nextPatientId = 0;

export class GameModel {
  money = 500;
  reputation = 50; // 0–100
  shiftTimeLeft = 180; // seconds (3 minute shift)
  patients: Patient[] = [];
  staff: Staff[] = [];
  rooms: Room[] = [];
  events: HospitalEvent[] = [];

  private patientSpawnTimer = 0;
  private patientSpawnInterval = 6; // seconds between spawns

  resetRun() {
    this.money = 500;
    this.reputation = 50;
    this.shiftTimeLeft = 180;
    this.patients = [];
    this.staff = [];
    this.rooms = [];
    this.events = [];
    this.patientSpawnTimer = 0;
    nextPatientId = 0;
  }

  /** Create a new patient data object. Mesh is assigned later by the graphics layer. */
  spawnPatient(): Patient {
    const id = `patient_${nextPatientId++}`;
    const dangerous = Math.random() < 0.1; // 10% chance
    const diagnosis = DIAGNOSES[Math.floor(Math.random() * DIAGNOSES.length)]!;
    const patient: Patient = {
      id,
      state: "entering",
      health: 0.3 + Math.random() * 0.4, // 0.3–0.7
      patience: 0.8 + Math.random() * 0.2, // 0.8–1.0
      dangerous,
      diagnosis,
      assignedRoom: null,
      assignedDoctor: null,
      mesh: null,
    };
    this.patients.push(patient);
    return patient;
  }

  /** Tick the spawn timer. Returns a new patient if one should spawn this frame. */
  tickSpawner(dt: number): Patient | null {
    this.patientSpawnTimer += dt;
    if (this.patientSpawnTimer >= this.patientSpawnInterval) {
      this.patientSpawnTimer -= this.patientSpawnInterval;
      return this.spawnPatient();
    }
    return null;
  }

  getPatientById(id: string): Patient | undefined {
    return this.patients.find((p) => p.id === id);
  }

  getStaffById(id: string): Staff | undefined {
    return this.staff.find((s) => s.id === id);
  }

  /** Patients currently in the pipeline (not yet gone). */
  getActivePatients(): Patient[] {
    return this.patients.filter((p) => p.state !== "gone");
  }

  /** Find an idle staff member by role. */
  findIdleStaff(role: Staff["role"]): Staff | undefined {
    return this.staff.find((s) => s.role === role && s.state === "idle");
  }

  /** Find a free room (not reception/waiting — those are communal). */
  findFreeRoom(): Room | undefined {
    return this.rooms.find(
      (r) =>
        !r.occupied &&
        r.id !== "reception" &&
        r.id !== "waiting",
    );
  }

  pushEvent(event: HospitalEvent) {
    this.events.push(event);
  }

  addMoney(amount: number) {
    this.money += amount;
  }

  /** Treatment outcome. Returns true on success. */
  resolveTreatment(patientId: string): boolean {
    const patient = this.getPatientById(patientId);
    if (!patient) return false;

    const successChance = 0.65 + this.reputation * 0.003; // 65%–95%
    const success = Math.random() < successChance;

    if (success) {
      patient.health = 1;
      patient.state = "exiting";
      const reward = 100 + Math.floor(Math.random() * 100);
      this.addMoney(reward);
      this.reputation = Math.min(100, this.reputation + 2);
    } else {
      patient.state = "exiting";
      const penalty = 50 + Math.floor(Math.random() * 150);
      this.addMoney(-penalty);
      this.reputation = Math.max(0, this.reputation - 5);
      this.pushEvent({
        type: "lawsuit",
        sourceId: patientId,
        targetId: "",
        severity: 0.5,
        timestamp: Date.now(),
      });
    }
    return success;
  }
}
