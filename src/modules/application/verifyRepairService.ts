import type { AIProvider, IssueRepository, Verification } from "@/src/modules/contracts";
import { err, ok, Result, ValidationError } from "@/src/modules/core";
import { LifecycleStateMachine } from "@/src/modules/lifecycle";

export interface VerifyRepairDTO {
  issueId: string;
  afterImageBase64: string;
  actor: string;
  targetDepartmentStage?: "ready_for_verification" | "closed";
}

export class VerifyRepairService {
  constructor(
    private aiProvider: AIProvider,
    private issueRepository: IssueRepository
  ) {}

  public async verifyRepair(dto: VerifyRepairDTO): Promise<Result<Verification, ValidationError>> {
    if (!dto.issueId || !dto.issueId.trim()) {
      return err(new ValidationError("issueId must be a non-empty string", "issueId"));
    }

    const issue = await this.issueRepository.getById(dto.issueId);
    if (!issue) {
      return err(new ValidationError(`Issue '${dto.issueId}' not found`, "issueId"));
    }

    // 1. Perform observational AI repair verification
    const verification = await this.aiProvider.verifyRepair(issue.imageUrl, dto.afterImageBase64);

    // 2. Validate lifecycle transition BEFORE persistence (AI verification MUST NOT directly mutate state)
    const currentLifecycle = issue.lifecycleState ?? LifecycleStateMachine.createInitialState(dto.actor);
    const targetStage = dto.targetDepartmentStage ?? "ready_for_verification";

    const transitionResult = LifecycleStateMachine.transitionDepartment(
      currentLifecycle,
      targetStage,
      dto.actor,
      `AI Repair Verification (Confidence: ${verification.confidence}): ${verification.notes}`
    );

    if (transitionResult.isFailure) {
      return err(transitionResult.error);
    }

    // 3. Persist lifecycle state update only after validation
    await this.issueRepository.updateLifecycle(dto.issueId, transitionResult.value);

    return ok(verification);
  }
}
