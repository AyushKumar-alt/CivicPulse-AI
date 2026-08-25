import { ConflictError } from "../../src/modules/lifecycle/lifecycleErrors";
import { canTransition } from "../../src/modules/lifecycle/lifecycleStateMachine";

async function runConcurrencyRaceTest() {
  console.log("🧪 Executing Transaction Concurrency & Race Condition Verification...");
  let testCount = 0;

  function assert(condition: boolean, msg: string) {
    testCount++;
    if (!condition) {
      console.error(`❌ Test FAILED: ${msg}`);
      throw new Error(msg);
    }
  }

  // Simulated Document Storage
  let documentState = {
    issueId: "iss_race_99",
    state: "ACKNOWLEDGED",
    version: 1,
  };
  const eventLog: any[] = [];

  // Transaction runner simulating optimistic lock / version check inside runTransaction
  async function simulateAtomicTransaction(actorId: string, expectedFromState: string, targetState: any) {
    // 1. Read document
    const snapshotState = { ...documentState };

    // Simulating random network micro-delay before commit
    await new Promise((resolve) => setTimeout(resolve, Math.floor(Math.random() * 20)));

    // 2. Validate current state inside transaction callback
    if (snapshotState.state !== expectedFromState) {
      throw new ConflictError(
        `State conflict: expected '${expectedFromState}', but current state is '${snapshotState.state}'.`
      );
    }

    // 3. Evaluate guard
    const guardRes = canTransition(snapshotState.state as any, targetState, "DEPARTMENT_OFFICER", {});
    if (!guardRes.ok) throw new Error(guardRes.message);

    // 4. Check lock/version invariant before writing
    if (documentState.version !== snapshotState.version) {
      throw new ConflictError(`Optimistic lock failure: document version changed during transaction execution.`);
    }

    // 5. Atomic write
    documentState.state = targetState;
    documentState.version += 1;
    eventLog.push({
      eventId: `evt_${Date.now()}_${Math.random()}`,
      fromState: snapshotState.state,
      toState: targetState,
      actorId,
    });

    return true;
  }

  // Launch two concurrent transactions racing against same document
  console.log("  🏎️ Launching two concurrent transaction promises against 'iss_race_99'...");
  const p1 = simulateAtomicTransaction("officer_A", "ACKNOWLEDGED", "UNDER_INVESTIGATION");
  const p2 = simulateAtomicTransaction("officer_B", "ACKNOWLEDGED", "UNDER_INVESTIGATION");

  const results = await Promise.allSettled([p1, p2]);

  const fulfilled = results.filter((r) => r.status === "fulfilled");
  const rejected = results.filter((r) => r.status === "rejected");

  assert(fulfilled.length === 1, "Exactly one transaction promise must succeed");
  assert(rejected.length === 1, "Exactly one transaction promise must fail due to state conflict");

  const rejectionReason = (rejected[0] as PromiseRejectedResult).reason;
  assert(rejectionReason instanceof ConflictError, "Failed transaction receives ConflictError");
  assert(documentState.state === "UNDER_INVESTIGATION", "Final document state is UNDER_INVESTIGATION");
  assert(eventLog.length === 1, "Exactly one transition event was recorded in eventLog");

  console.log(`🎉 TRANSACTION CONCURRENCY SUITE PASSED ALL ${testCount} ASSERTIONS!`);
}

runConcurrencyRaceTest().catch((e) => {
  console.error(e);
  process.exit(1);
});
