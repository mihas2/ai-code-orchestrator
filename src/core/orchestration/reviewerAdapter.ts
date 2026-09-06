import type {
	ArtifactDescriptor,
	OrchestrationNode,
	OrchestrationRun,
	OrchestrationSnapshot,
	ReviewAdapter,
	ReviewFinding,
	ReviewResult,
	ResultContract,
	SynthesisAdapter,
	SynthesisResult,
} from "./types"

export type ReviewerRunner = (input: {
	run: Readonly<OrchestrationRun>
	node: Readonly<OrchestrationNode>
	result: Readonly<ResultContract>
	artifacts: readonly ArtifactDescriptor[]
	idempotencyKey: string
	diff?: string
	acceptanceCriteria: readonly string[]
}) => Promise<ReviewFinding[]>

/** Bridges the orchestration review contract to the host's reviewer execution. */
export class ReviewerAdapter implements ReviewAdapter {
	constructor(private readonly runner?: ReviewerRunner) {}

	async review(input: Parameters<ReviewAdapter["review"]>[0]): Promise<ReviewResult> {
		if (!this.runner) {
			if (input.run.settingsSnapshot.reviewPolicy === "off")
				return { findings: [], artifactRefs: input.artifacts.map((a) => a.ref) }
			throw new Error("ReviewerRunner is not configured")
		}
		const findings = await this.runner({
			...input,
			diff: undefined,
			acceptanceCriteria: input.node.inputContract.acceptanceCriteria,
		})
		return {
			findings: findings.map((finding) => ({
				...finding,
				findingId: finding.findingId ?? finding.id,
				runId: finding.runId ?? input.run.runId,
				nodeId: finding.nodeId ?? input.node.nodeId,
				title: finding.title ?? finding.message,
				filePath: finding.filePath ?? finding.file,
			})),
			artifactRefs: input.artifacts.map((artifact) => artifact.ref),
		}
	}
}

/** Deterministic synthesis adapter used by the runtime when no external synthesizer is configured. */
export class OrchestrationSynthesisAdapter implements SynthesisAdapter {
	async synthesize(snapshot: Readonly<OrchestrationSnapshot>): Promise<SynthesisResult> {
		return {
			runId: snapshot.run.runId,
			status: snapshot.nodes.every((node) => node.status === "integrated") ? "completed" : "partial",
			summary: snapshot.run.goal,
			nodeSummaries: snapshot.nodes.map((node) => ({
				nodeId: node.nodeId,
				status: node.status,
				summary: node.outputContract?.summary,
			})),
			artifactRefs: snapshot.artifacts?.map((artifact) => artifact.ref) ?? [],
			conflictRefs: snapshot.conflicts?.map((conflict) => conflict.id) ?? [],
			reviewFindingIds: snapshot.findings?.map((finding) => finding.findingId ?? finding.id) ?? [],
			generatedAt: Date.now(),
		}
	}
}
