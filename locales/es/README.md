<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=mihas2.ai-code-orchestrator"><img src="https://img.shields.io/badge/VS_Code_Marketplace-007ACC?style=flat&logo=visualstudiocode&logoColor=white" alt="VS Code Marketplace"></a>
</p>

# AI Code Orchestrator

> Tu equipo de desarrollo con IA, directamente en tu editor.

AI Code Orchestrator es una extensión de VS Code y una CLI para planificar, implementar, revisar y explicar software con agentes de IA configurables. Reúne chat, acciones de código, flujos de trabajo en la terminal, roles personalizados, integraciones MCP y orquestación multiagente en un solo espacio de trabajo.

## Capacidades

- Generar y modificar código a partir de requisitos en lenguaje natural
- Planificar la arquitectura y dividir el trabajo en tareas coordinadas
- Orquestar el trabajo como un DAG con dependencias, ejecutores en paralelo, etapas de revisión, presupuestos e integración controlada
- **Optimización del contexto**: la gestión inteligente del contexto reduce el uso de tokens y los costos sin perder eficacia
- Revisar cambios, diagnosticar fallos y mejorar el código existente
- Trabajar con archivos, terminales, imágenes y herramientas MCP externas
- Configurar proveedores, incluidos Vercel AI Gateway y Unbound, modelos, permisos y roles personalizados
- Asignar un perfil de proveedor y un modelo a cada rol; un rol sin modelo propio usa el modelo de su perfil, y un rol sin perfil usa el perfil predeterminado
- Continuar tareas desde el editor o desde la línea de comandos

## Roles

AI Code Orchestrator se adapta al trabajo que tienes entre manos:

- **Code** — implementar cambios y operar sobre los archivos del proyecto
- **Architect** — diseñar sistemas, especificaciones y migraciones
- **Ask** — responder preguntas y explicar código
- **Debug** — aislar las causas raíz y validar las correcciones
- **Reviewer** — validar cambios, detectar problemas y garantizar la calidad
- **Orchestrator** (predeterminado) — coordinar grafos de tareas con dependencias y agentes en paralelo
- **Translate** — traducir y gestionar archivos de localización
- **Custom** (opcional) — crear flujos de trabajo especializados para un equipo

Cada rol puede usar su propio perfil de proveedor y modelo, definidos en Configuración → Modos con independencia del perfil predeterminado seleccionado en Configuración → Proveedores. Un rol sin modelo propio usa el modelo de su perfil, y un rol sin perfil usa el perfil predeterminado, lo que facilita equilibrar capacidad, velocidad y costo en un flujo de trabajo.

## Documentación

Consulta la documentación del proyecto, incluida la especificación de orquestación, en [`apps/docs`](../../apps/docs).

## Instalación

Instala la extensión **AI Code Orchestrator** desde el VS Code Marketplace o genera un VSIX nuevo localmente:

```bash
pnpm install
pnpm rebuild:vsix
```

Para reconstruirla y luego instalarla de forma interactiva, ejecuta `pnpm install:vsix`. Esto reconstruye explícitamente la webview antes de empaquetar la extensión. Un `pnpm install` normal solo instala las dependencias.

Durante el desarrollo, la CLI está disponible desde el monorepo:

```bash
pnpm --filter @ai-code-orchestrator/cli dev
```

El ámbito del paquete y los identificadores de comandos heredados se conservan por compatibilidad con las integraciones existentes.

## Atribución

AI Code Orchestrator se basa en [Roo Code](https://github.com/RooCodeInc/Roo-Code). La implementación conserva algunas API e identificadores compatibles para que las integraciones existentes sigan funcionando.

## Licencia

[Apache 2.0](../../LICENSE)
