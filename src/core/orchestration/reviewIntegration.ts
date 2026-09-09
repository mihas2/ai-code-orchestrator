import type {
	ArtifactDescriptor,
	ConflictRecord,
	IntegrationAdapter,
	IntegrationResult,
	OrchestrationNode,
	OrchestrationRun,
	ReviewFinding,
	ReviewResult,
	SynthesisAdapter,
	SynthesisResult,
	OrchestrationSnapshot,
} from "./types"

export interface ReviewPolicyGate {
	policy: OrchestrationRun["settingsSnapshot"]["reviewPolicy"]
	findings: readonly ReviewFinding[]
}

export function reviewBlocks(gate: ReviewPolicyGate): boolean {
	if (gate.policy === "off") return false
	return gate.findings.some((finding) => finding.severity === "blocker" || finding.severity === "major")
}

export function createFinding(
	finding: Omit<ReviewFinding, "provenance">,
	artifactRefs: string[] = [],
	conflictRefs: string[] = [],
): ReviewFinding {
	return { ...finding, provenance: { artifactRefs, conflictRefs, detectedAt: Date.now() } }
}

export interface IntegrationCoordinatorInput {
	run: Readonly<OrchestrationRun>
	node: Readonly<OrchestrationNode>
	artifacts: readonly ArtifactDescriptor[]
	adapter: IntegrationAdapter
	approved: boolean
	baseHash?: string
	parentArtifacts?: readonly ArtifactDescriptor[]
	parentNodeId?: string
	childNodeId?: string
}

/** Performs all cheap safety checks before allowing an adapter to mutate the workspace. */
export async function coordinateIntegration(input: IntegrationCoordinatorInput): Promise<IntegrationResult> {
	const conflictRefs: string[] = []
	if (!input.approved)
		return {
			nodeId: input.node.nodeId,
			status: "blocked",
			artifactRefs: input.artifacts.map((a) => a.ref),
			conflictRefs,
			message: "Integration approval is required",
		}
	const paths = input.artifacts.map((a) => a.path).filter(Boolean)
	const writeScopes = input.node.inputContract?.fileScopes?.write ?? input.node.inputContract?.fileScopes?.include
	const outOfScope = writeScopes
		? paths.filter(
				(artifactPath) =>
					!writeScopes.some(
						(scope) => scope === artifactPath || artifactPath.startsWith(`${scope.replace(/\/$/, "")}/`),
					),
			)
		: []
	if (outOfScope.length)
		return {
			nodeId: input.node.nodeId,
			status: "blocked",
			artifactRefs: input.artifacts.map((a) => a.ref),
			conflictRefs: outOfScope,
			message: `Artifact paths are outside node scope: ${outOfScope.join(", ")}`,
		}
	const duplicatePaths = paths.filter((path, index) => paths.indexOf(path) !== index)
	if (duplicatePaths.length)
		return {
			nodeId: input.node.nodeId,
			status: "blocked",
			artifactRefs: input.artifacts.map((a) => a.ref),
			conflictRefs: duplicatePaths,
			message: "Artifact path overlap detected",
		}
	if (input.baseHash && input.artifacts.some((a) => a.baseHash && a.baseHash !== input.baseHash)) {
		return {
			nodeId: input.node.nodeId,
			status: "blocked",
			artifactRefs: input.artifacts.map((a) => a.ref),
			conflictRefs: ["base_revision"],
			message: "Base revision changed; artifacts were preserved",
		}
	}
	const idempotencyKey = `integration:${input.run.runId}:${input.node.nodeId}:${input.node.attempt}`
	const checked = await input.adapter.check({ ...input, idempotencyKey })
	if (!checked.safe || checked.conflicts.length)
		return {
			nodeId: input.node.nodeId,
			status: "blocked",
			artifactRefs: input.artifacts.map((a) => a.ref),
			conflictRefs: checked.conflicts,
			message: checked.conflicts.some((conflict) => conflict.startsWith("parent_child:"))
				? `Conflicting artifacts detected: ${checked.conflicts
						.filter((conflict) => conflict.startsWith("parent_child:"))
						.map((conflict) => conflict.slice("parent_child:".length))
						.join(", ")}`
				: "Integration adapter reported a conflict; artifacts were preserved",
		}
	try {
		return {
			nodeId: input.node.nodeId,
			status: "integrated",
			artifactRefs: (await input.adapter.integrate({ ...input, idempotencyKey })).artifactRefs,
			conflictRefs,
		}
	} catch (error) {
		return {
			nodeId: input.node.nodeId,
			status: "failed",
			artifactRefs: input.artifacts.map((a) => a.ref),
			conflictRefs,
			message: error instanceof Error ? error.message : String(error),
		}
	}
}

export async function synthesizeSnapshot(
	snapshot: OrchestrationSnapshot,
	adapter?: SynthesisAdapter,
): Promise<SynthesisResult> {
	if (adapter) return adapter.synthesize(snapshot)
	return {
		runId: snapshot.run.runId,
		status: snapshot.nodes.every((n) => n.status === "integrated") ? "completed" : "partial",
		summary: snapshot.run.goal,
		nodeSummaries: snapshot.nodes.map((n) => ({
			nodeId: n.nodeId,
			status: n.status,
			summary: n.outputContract?.summary,
		})),
		artifactRefs: snapshot.artifacts?.map((a) => a.ref) ?? [],
		conflictRefs: snapshot.conflicts?.map((c) => c.id) ?? [],
		reviewFindingIds: snapshot.findings?.map((f) => f.id) ?? [],
		generatedAt: Date.now(),
	}
}

export type { ConflictRecord, ReviewResult }
