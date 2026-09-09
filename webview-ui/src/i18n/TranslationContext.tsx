import React, { createContext, useContext, ReactNode, useEffect, useMemo } from "react"
import { useTranslation } from "react-i18next"
import type { TFunction } from "i18next"
import i18next, { loadTranslations } from "./setup"
import { useExtensionState } from "@/context/ExtensionStateContext"

// Create context for translations
export const TranslationContext = createContext<{
	t: TFunction
	tEn: TFunction
	i18n: typeof i18next
}>({
	t: ((key: string) => key) as TFunction,
	tEn: ((key: string) => key) as TFunction,
	i18n: i18next,
})

// Translation provider component
export const TranslationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
	// Initialize with default configuration
	const { i18n } = useTranslation()
	// Get the extension state directly - it already contains all state properties
	const extensionState = useExtensionState()

	// Load translations once when the component mounts
	useEffect(() => {
		try {
			loadTranslations()
		} catch (error) {
			console.error("Failed to load translations:", error)
		}
	}, [])

	useEffect(() => {
		i18n.changeLanguage(extensionState.language)
	}, [i18n, extensionState.language])

	// Get the translation function directly from i18n (already memoized by i18next)
	const translate = i18n.t

	// Create a fixed English translation function for fallback
	const translateEn = useMemo(() => {
		return i18n.getFixedT("en")
	}, [i18n])

	return (
		<TranslationContext.Provider
			value={{
				t: translate,
				tEn: translateEn,
				i18n,
			}}>
			{children}
		</TranslationContext.Provider>
	)
}

// Custom hook for easy translations
export const useAppTranslation = () => useContext(TranslationContext)

export default TranslationProvider
