import { createHash } from "node:crypto"

export type DerivedView = "ast" | "symbols" | "dependencies" | "search" | "embeddings" | "summary" | (string & {})

export interface ContextCacheEntry<T = unknown> {
	contentDigest: string
	value: T
	createdAt: number
	lastAccessedAt: number
}

/** Small process-local LRU cache. The digest is part of the key and therefore invalidates stale views. */
export class ContentDigestCache {
	private readonly entries = new Map<string, ContextCacheEntry>()
	constructor(private readonly maxEntries = 256) {}

	get<T>(view: DerivedView, source: string | Uint8Array): T | undefined {
		const key = this.key(view, source)
		const entry = this.entries.get(key) as ContextCacheEntry<T> | undefined
		if (!entry) return undefined
		entry.lastAccessedAt = Date.now()
		this.entries.delete(key)
		this.entries.set(key, entry)
		return entry.value
	}

	set<T>(view: DerivedView, source: string | Uint8Array, value: T): string {
		const contentDigest = digest(source)
		const key = `${view}:${contentDigest}`
		const now = Date.now()
		this.entries.delete(key)
		this.entries.set(key, { contentDigest, value, createdAt: now, lastAccessedAt: now })
		while (this.entries.size > this.maxEntries) this.entries.delete(this.entries.keys().next().value as string)
		return contentDigest
	}

	getOrCompute<T>(
		view: DerivedView,
		source: string | Uint8Array,
		compute: () => T,
	): { value: T; hit: boolean; contentDigest: string } {
		const contentDigest = digest(source)
		const cached = this.get<T>(view, source)
		if (cached !== undefined) return { value: cached, hit: true, contentDigest }
		const value = compute()
		this.set(view, source, value)
		return { value, hit: false, contentDigest }
	}

	clear(): void {
		this.entries.clear()
	}
	private key(view: DerivedView, source: string | Uint8Array): string {
		return `${view}:${digest(source)}`
	}
}

export function digest(value: string | Uint8Array): string {
	return createHash("sha256").update(value).digest("hex")
}

export interface ContextBlock {
	id?: string
	content: string
	required?: boolean
}
export interface DeduplicatedBlock extends ContextBlock {
	id: string
	content: string
	reference?: string
}

/** Required blocks are never replaced; other repeated blocks become stable references. */
export function deduplicateContext(blocks: readonly ContextBlock[]): DeduplicatedBlock[] {
	const seen = new Map<string, string>()
	return blocks.map((block, index) => {
		const id = block.id ?? `block-${index + 1}`
		const previous = seen.get(block.content)
		if (previous && !block.required) return { ...block, id, content: `@ref:${previous}`, reference: previous }
		seen.set(block.content, id)
		return { ...block, id }
	})
}

export interface PromptParts {
	stablePrefix: string
	variableContext: string
}
export function buildStablePrefixPrompt(parts: PromptParts, promptCaching: boolean): string {
	// Keep the ordering identical even when caching is unavailable; providers can then opt in safely.
	return `${parts.stablePrefix}\n\n${parts.variableContext}`
}

export class SentFileTracker {
	private readonly sent = new Map<string, string>()
	shouldSend(path: string, content: string | Uint8Array, representation = "full"): boolean {
		const key = `${path}:${representation}`
		const hash = digest(content)
		if (this.sent.get(key) === hash) return false
		this.sent.set(key, hash)
		return true
	}
	clear(): void {
		this.sent.clear()
	}
}

export interface ContextOptimizationMetrics {
	inputTokens: number
	outputTokens: number
	cachedTokens: number
	contextSize: number
	cacheHits: number
	cacheMisses: number
	repeatedBytes: number
	cost?: number
	selectionEfficiency?: number
}
export class ContextOptimizationMetricsCollector {
	private metrics: ContextOptimizationMetrics = {
		inputTokens: 0,
		outputTokens: 0,
		cachedTokens: 0,
		contextSize: 0,
		cacheHits: 0,
		cacheMisses: 0,
		repeatedBytes: 0,
	}
	record(update: Partial<ContextOptimizationMetrics>): void {
		this.metrics = { ...this.metrics, ...update }
	}
	increment(field: "cacheHits" | "cacheMisses" | "repeatedBytes", amount = 1): void {
		this.metrics[field] += amount
	}
	snapshot(): ContextOptimizationMetrics {
		return { ...this.metrics }
	}
	publish(publish: (event: Record<string, unknown>) => void): void {
		publish({ type: "contextOptimization", metrics: this.snapshot() })
	}
}
