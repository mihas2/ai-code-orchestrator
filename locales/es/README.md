<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=mihas2.ai-code-orchestrator"><img src="https://img.shields.io/badge/VS_Code_Marketplace-007ACC?style=flat&logo=visualstudiocode&logoColor=white" alt="VS Code Marketplace"></a>
</p>
# AI Code Orchestrator

> Tu equipo de desarrollo con IA, directamente en tu editor

<details>
  <summary>🌐 Idiomas disponibles</summary>

- [English](../../README.md)
- [Català](../ca/README.md)
- [Deutsch](../de/README.md)
- [Español](../es/README.md)
- [Français](../fr/README.md)
- [हिंदी](../hi/README.md)
- [Bahasa Indonesia](../id/README.md)
- [Italiano](../it/README.md)
- [日本語](../ja/README.md)
- [한국어](../ko/README.md)
- [Nederlands](../nl/README.md)
- [Polski](../pl/README.md)
- [Português (BR)](../pt-BR/README.md)
- [Русский](../ru/README.md)
- [Türkçe](../tr/README.md)
- [Tiếng Việt](../vi/README.md)
- [简体中文](../zh-CN/README.md)
- [繁體中文](../zh-TW/README.md)
- ...
  </details>

---

## ¿Qué puede hacer AI Code Orchestrator por TI?

- Generar código a partir de descripciones en lenguaje natural
- Adaptarse con Modos: Código, Arquitecto, Pregunta, Depuración y Modos Personalizados
- Refactorizar y depurar código existente
- Escribir y actualizar documentación
- Responder preguntas sobre tu base de código
- Automatizar tareas repetitivas
- Utilizar servidores MCP

## Modos

AI Code Orchestrator se adapta a tu forma de trabajar, no al revés:

- Modo Código: codificación diaria, ediciones y operaciones de archivos
- Modo Arquitecto: planificar sistemas, especificaciones y migraciones
- Modo Pregunta: respuestas rápidas, explicaciones y documentos
- Modo Depuración: rastrear problemas, agregar registros, aislar causas raíz
- Modo Traducción: traducir y gestionar archivos de localización
- Modos Personalizados: crea modos especializados para tu equipo o flujo de trabajo

Más info: [Usar Modos](https://github.com/mihas2/ai-code-orchestrator/basic-usage/using-modes) • [Modos Personalizados](https://github.com/mihas2/ai-code-orchestrator/advanced-usage/custom-modes)

## Recursos

- **[Documentación](https://github.com/mihas2/ai-code-orchestrator):** La guía oficial para instalar, configurar y dominar AI Code Orchestrator.
- **[Incidencias de GitHub](https://github.com/AIOrchestrator/ai-code-orchestrator/issues):** Reporta errores y sigue el desarrollo.

---

## Aviso legal

**Ten en cuenta** que AI Code Orchestrator, Inc **no** hace ninguna representación o garantía con respecto a cualquier código, modelo u otras herramientas proporcionadas o puestas a disposición en relación con AI Code Orchestrator, cualquier herramienta de terceros asociada, o cualquier resultado. Asumes **todos los riesgos** asociados con el uso de dichas herramientas o resultados; tales herramientas se proporcionan "**TAL CUAL**" y "**SEGÚN DISPONIBILIDAD**". Dichos riesgos pueden incluir, sin limitación, infracciones de propiedad intelectual, vulnerabilidades o ataques cibernéticos, sesgo, imprecisiones, errores, defectos, virus, tiempo de inactividad, pérdida o daño de propiedad y/o lesiones personales. Eres el único responsable de tu uso de dichas herramientas o resultados (incluidas, entre otras, la legalidad, idoneidad y resultados de los mismos).

---

## Instalación

Instala la extensión **AI Code Orchestrator** desde el VS Code Marketplace, o reconstruye un VSIX local:

```bash
pnpm install
pnpm rebuild:vsix
```

Para reconstruir y luego instalarla de forma interactiva, ejecuta `pnpm install:vsix`. Esto reconstruye explícitamente la webview antes de empaquetar y empaquetar la extensión. Un normal `pnpm install` solo instala dependencias.

Durante el desarrollo, la CLI está disponible desde el monorepo:

```bash
pnpm --filter @ai-code-orchestrator/cli dev
```

El alcance del paquete y los identificadores de comandos heredados se conservan para mantener la compatibilidad con las integraciones existentes.

## Licencia

[Apache 2.0 © 2025 AI Code Orchestrator, Inc.](../../LICENSE)
