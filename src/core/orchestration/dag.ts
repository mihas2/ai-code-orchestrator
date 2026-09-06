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
	const owners = new Map<string, PlanNodeInput>()
	for (const n of nodes)
		for (const path of n.inputContract.fileScopes.write ?? []) {
			const owner = owners.get(path)
			if (
				owner &&
				!owner.inputContract.fileScopes.allowOverlapWith?.includes(n.nodeId) &&
				!n.inputContract.fileScopes.allowOverlapWith?.includes(owner.nodeId)
			)
				issues.push({ code: "duplicate_write_scope", nodeIds: [owner.nodeId, n.nodeId], path })
			else owners.set(path, n)
		}
	return issues
}
