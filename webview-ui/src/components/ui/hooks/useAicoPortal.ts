import { useState } from "react"
import { useMount } from "react-use"

export const useAicoPortal = (id: string) => {
	const [container, setContainer] = useState<HTMLElement>()

	useMount(() => setContainer(document.getElementById(id) ?? undefined))

	return container
}
