import assert from "assert";
import { FirestoreIssueRepository } from "@/src/modules/data/firestoreRepository";
import { LifecycleService, type ActorContext } from "@/src/modules/lifecycle/lifecycleService";

class MockFirestoreDb {
  public store = new Map<string, any>();
  public caseEventsStore = new Map<string, any[]>();

  collection(path: string) {
    const self = this;
    if (path === "issues") {
      return {
        doc(id?: string) {
          const docId = id || `doc_${Math.random()}`;
          return {
            get: async () => ({
              exists: self.store.has(docId),
              id: docId,
              data: () => self.store.get(docId),
            }),
            set: async (data: any, options?: any) => {
              if (options?.merge && self.store.has(docId)) {
                self.store.set(docId, { ...self.store.get(docId), ...data });
              } else {
                self.store.set(docId, data);
              }
            },
            update: async (data: any) => {
              const curr = self.store.get(docId) || {};
              self.store.set(docId, { ...curr, ...data });
            },
            collection(subPath: string) {
              if (subPath === "case_events") {
                return {
                  doc() {
                    return {
                      set: async (evtData: any) => {
                        const list = self.caseEventsStore.get(docId) || [];
                        list.push(evtData);
                        self.caseEventsStore.set(docId, list);
                      },
                    };
                  },
                  get: async () => {
                    const list = self.caseEventsStore.get(docId) || [];
                    return {
                      docs: list.map((evt, idx) => ({
                        id: `evt_${idx}`,
                        data: () => evt,
                      })),
                    };
                  },
                };
              }
              throw new Error(`Unsupported subcollection: ${subPath}`);
            },
          };
        },
        where(field: string, op: string, val: unknown) {
          return {
            get: async () => {
              const matched: any[] = [];
              for (const [id, data] of self.store.entries()) {
                if (op === "==" && data[field] === val) {
                  matched.push({ id, data: () => data });
                }
              }
              return { docs: matched };
            },
          };
        },
      };
    }
    throw new Error(`Unsupported collection: ${path}`);
  }

  async runTransaction<T>(updateFunction: (transaction: any) => Promise<T>): Promise<T> {
    const self = this;
    const tx = {
      get: async (ref: any) => ref.get(),
      set: (ref: any, data: any, options?: any) => ref.set(data, options),
      update: (ref: any, data: any) => ref.update(data),
    };
    return updateFunction(tx);
  }
}

async function runDepartmentWorkspaceIntegrationTests() {
  console.log("🧪 Running Department Operational Workspace Integration Test Suite...");

  const mockDb = new MockFirestoreDb();
  const repo = new FirestoreIssueRepository(mockDb as any);
  (LifecycleService as any).getDb = () => mockDb;

  const issueId = "iss_dept_test_101";
  const officerActor: ActorContext = {
    actorId: "officer_bescom_01",
    actorRole: "DEPARTMENT_OFFICER",
    assignedAgencyId: "bengaluru_bescom",
  };
  const supervisorActor: ActorContext = {
    actorId: "supervisor_bescom_01",
    actorRole: "SUPERVISOR",
    assignedAgencyId: "bengaluru_bescom",
  };
  const crewActor: ActorContext = {
    actorId: "crew_04",
    actorRole: "FIELD_CREW",
    assignedAgencyId: "bengaluru_bescom",
  };

  // 1. Create and Route issue
  const createResult = await LifecycleService.createAndRoute({
    issueId,
    photoUrl: "https://example.com/elec.jpg",
    userDescription: "Damaged transformer box spilling oil and sparking",
    geoContext: {
      cityId: "bengaluru",
      localityName: "Hunasamaranahalli",
      talukName: "Yelahanka",
      districtName: "Bengaluru Urban",
      state: "Karnataka",
      country: "India",
      coordinates: { latitude: 13.147, longitude: 77.620 },
      fullAddress: "Hunasamaranahalli, Yelahanka Taluk, Bengaluru Urban, Karnataka, India",
    },
    classification: {
      categoryKey: "electricity" as any,
      subcategoryKey: "transformer_damage",
      issueTypeKey: "sparking_transformer",
      issueTypeDisplayName: "Sparking Electrical Transformer Box",
      visualSeverity: "critical",
      confidence: 0.98,
      safetyRiskDescription: "High voltage electrical spark hazard",
      priorityScore: 9.5,
      priorityReasoning: "Imminent danger of electrocution",
      visualObservations: ["Exposed high-voltage wire", "Sparking box"],
    },
    reporterUid: "citizen_101",
  });

  assert.strictEqual(createResult.assignedAgencyId, "bengaluru_bescom");

  // 2. Verify Firestore model maps canonical state = ROUTED
  const canonicalIssue1 = await repo.getById(issueId);
  assert(canonicalIssue1 !== null);
  assert.strictEqual(canonicalIssue1.state, "ROUTED");
  assert.notStrictEqual(canonicalIssue1.state, "analyzed");
  console.log("  ✅ Test #1: Firestore repository maps canonical state = ROUTED (not legacy 'analyzed')");

  // 3. Department Queue Query returns state = ROUTED
  const agencyIssues = await repo.queryByAgency("bengaluru_bescom");
  assert.strictEqual(agencyIssues.length, 1);
  assert.strictEqual(agencyIssues[0].state, "ROUTED");
  console.log("  ✅ Test #2: Department queue query returns canonical state = ROUTED");

  // 4. ROUTED -> ACKNOWLEDGED
  await LifecycleService.acknowledge(issueId, officerActor);
  const canonicalIssue2 = await repo.getById(issueId);
  assert.strictEqual(canonicalIssue2?.state, "ACKNOWLEDGED");
  console.log("  ✅ Test #3: Canonical transition ROUTED -> ACKNOWLEDGED successful");

  // 5. ACKNOWLEDGED -> UNDER_INVESTIGATION
  await LifecycleService.startInvestigation(issueId, officerActor);
  const canonicalIssue3 = await repo.getById(issueId);
  assert.strictEqual(canonicalIssue3?.state, "UNDER_INVESTIGATION");
  console.log("  ✅ Test #4: Canonical transition ACKNOWLEDGED -> UNDER_INVESTIGATION successful");

  // 6. UNDER_INVESTIGATION -> VALIDATED
  await LifecycleService.validate(issueId, supervisorActor);
  const canonicalIssue4 = await repo.getById(issueId);
  assert.strictEqual(canonicalIssue4?.state, "VALIDATED");
  console.log("  ✅ Test #5: Canonical transition UNDER_INVESTIGATION -> VALIDATED successful");

  // 7. VALIDATED -> FIELD_ASSIGNED
  await LifecycleService.fieldAssign(
    {
      issueId,
      unitId: "yelahanka_div",
      crewId: "crew_04",
      leadOfficerId: "officer_101",
    },
    supervisorActor
  );
  const canonicalIssue5 = await repo.getById(issueId);
  assert.strictEqual(canonicalIssue5?.state, "FIELD_ASSIGNED");
  assert.strictEqual(canonicalIssue5?.assignment?.crewId, "crew_04");
  console.log("  ✅ Test #6: Canonical transition VALIDATED -> FIELD_ASSIGNED with operational assignment successful");

  // 8. FIELD_ASSIGNED -> IN_PROGRESS
  await LifecycleService.startWork(issueId, crewActor);
  const canonicalIssue6 = await repo.getById(issueId);
  assert.strictEqual(canonicalIssue6?.state, "IN_PROGRESS");
  console.log("  ✅ Test #7: Canonical transition FIELD_ASSIGNED -> IN_PROGRESS successful");

  // 9. IN_PROGRESS -> RESOLUTION_SUBMITTED
  await LifecycleService.submitResolution(
    {
      issueId,
      afterEvidenceUrl: "https://example.com/repaired.jpg",
      resolutionNotes: "Transformer enclosure replaced and grounded safely.",
    },
    crewActor
  );
  const canonicalIssue7 = await repo.getById(issueId);
  assert.strictEqual(canonicalIssue7?.state, "RESOLUTION_SUBMITTED");
  console.log("  ✅ Test #8: Canonical transition IN_PROGRESS -> RESOLUTION_SUBMITTED with photo evidence successful");

  // 10. RESOLUTION_SUBMITTED -> CLOSED
  await LifecycleService.close(issueId, supervisorActor);
  const canonicalIssue8 = await repo.getById(issueId);
  assert.strictEqual(canonicalIssue8?.state, "CLOSED");
  console.log("  ✅ Test #9: Canonical transition RESOLUTION_SUBMITTED -> CLOSED successful");

  // 11. Verify case_events audit timeline
  const events = mockDb.caseEventsStore.get(issueId) || [];
  assert.strictEqual(events.length, 9);
  assert.strictEqual(events[0].toState, "CREATED");
  assert.strictEqual(events[1].toState, "ROUTED");
  assert.strictEqual(events[8].toState, "CLOSED");
  console.log("  ✅ Test #10: Immutable case_events timeline accurately recorded 9 transition events");

  console.log("🎉 ALL DEPARTMENT WORKSPACE INTEGRATION TESTS PASSED (10/10)!");
}

runDepartmentWorkspaceIntegrationTests().catch((err) => {
  console.error("❌ Test suite failed:", err);
  process.exit(1);
});
