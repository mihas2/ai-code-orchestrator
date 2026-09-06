import type { PlanNodeInput } from "./types"
export interface DagIssue {
	code: "duplicate_node" | "missing_dependency" | "cycle" | "duplicate_write_scope"
	nodeIds: string[]
	path?: string
}
export function validateDag(nodes: readonly PlanNodeInput[]): DagIssue[] {
	const issues: DagIssue[] = [],
		byId = new Map<string, PlanNodeInput>()
	for (const n of nodes) {
		if (byId.has(n.nodeId)) issues.push({ code: "duplicate_node", nodeIds: [n.nodeId] })
		else byId.set(n.nodeId, n)
	}
	// Explicit dependsOn takes priority; fileScopes are used only when dependsOn is empty.
	for (const n of nodes)
		for (const d of n.dependsOn ?? [])
			if (!byId.has(d)) issues.push({ code: "missing_dependency", nodeIds: [n.nodeId, d] })
	const visiting = new Set<string>(),
		visited = new Set<string>()
	const visit = (id: string, stack: string[]) => {
		if (visiting.has(id)) {
			issues.push({ code: "cycle", nodeIds: [...stack.slice(stack.indexOf(id)), id] })
			return
		}
		if (visited.has(id)) return
		visiting.add(id)
		for (const d of byId.get(id)?.dependsOn ?? []) if (byId.has(d)) visit(d, [...stack, id])
		visiting.delete(id)
		visited.add(id)
	}
	for (const id of byId.keys()) visit(id, [])
	const owners: Array<{ path: string; segments: string[]; node: PlanNodeInput }> = []
	for (const n of nodes)
		for (const path of n.inputContract.fileScopes.write ?? []) {
			const segments = path.split("/").filter(Boolean)
			for (const owner of owners) {
				const overlaps =
					segments.length <= owner.segments.length
						? segments.every((segment, index) => segment === owner.segments[index])
						: owner.segments.every((segment, index) => segment === segments[index])
				if (
					overlaps &&
					!owner.node.inputContract.fileScopes.allowOverlapWith?.includes(n.nodeId) &&
					!n.inputContract.fileScopes.allowOverlapWith?.includes(owner.node.nodeId)
				)
					issues.push({ code: "duplicate_write_scope", nodeIds: [owner.node.nodeId, n.nodeId], path })
			}
			owners.push({ path, segments, node: n })
		}
	return issues
}
