<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=mihas2.ai-code-orchestrator"><img src="https://img.shields.io/badge/VS_Code_Marketplace-007ACC?style=flat&logo=visualstudiocode&logoColor=white" alt="VS Code Marketplace"></a>
</p>

# AI Code Orchestrator

> Votre équipe de développement propulsée par l'IA, directement dans votre éditeur.

AI Code Orchestrator est une extension VS Code et une CLI pour planifier, implémenter, relire et expliquer des logiciels avec des agents IA configurables. Elle réunit le chat, les actions sur le code, les workflows en terminal, les rôles personnalisés, les intégrations MCP et l'orchestration multi-agents dans un seul espace de travail.

## Fonctionnalités

- Générer et modifier du code à partir d'exigences en langage naturel
- Concevoir l'architecture et découper le travail en tâches coordonnées
- Orchestrer le travail sous forme de DAG tenant compte des dépendances, avec exécuteurs parallèles, étapes de revue, budgets et intégration contrôlée
- **Optimisation du contexte** : une gestion intelligente du contexte réduit la consommation de tokens et les coûts tout en restant efficace
- Relire les modifications, diagnostiquer les échecs et améliorer le code existant
- Travailler avec des fichiers, des terminaux, des images et des outils MCP externes
- Configurer les fournisseurs, dont Vercel AI Gateway et Unbound, les modèles, les permissions et les rôles personnalisés
- Attribuer un profil de fournisseur et un modèle à chaque rôle ; un rôle sans modèle propre utilise le modèle de son profil, et un rôle sans profil utilise le profil par défaut
- Poursuivre les tâches depuis l'éditeur ou la ligne de commande

## Rôles

AI Code Orchestrator s'adapte au travail en cours :

- **Code** — implémenter les modifications et travailler sur les fichiers du projet
- **Architect** — concevoir des systèmes, des spécifications et des migrations
- **Ask** — répondre aux questions et expliquer le code
- **Debug** — isoler les causes profondes et valider les correctifs
- **Reviewer** — valider les modifications, repérer les problèmes et garantir la qualité
- **Orchestrator** (par défaut) — coordonner des graphes de tâches avec dépendances et des agents parallèles
- **Translate** — traduire et gérer les fichiers de localisation
- **Custom** (facultatif) — créer des workflows spécialisés pour une équipe

Chaque rôle peut utiliser son propre profil de fournisseur et son propre modèle, définis dans Paramètres → Modes indépendamment du profil par défaut sélectionné dans Paramètres → Fournisseurs. Un rôle sans modèle propre utilise le modèle de son profil, et un rôle sans profil utilise le profil par défaut, ce qui permet d'équilibrer facilement capacités, vitesse et coût dans un workflow.

## Documentation

Consultez la documentation du projet, y compris la spécification de l'orchestration, dans [`apps/docs`](../../apps/docs).

## Installation

Installez l'extension **AI Code Orchestrator** depuis le VS Code Marketplace, ou générez un nouveau VSIX en local :

```bash
pnpm install
pnpm rebuild:vsix
```

Pour la reconstruire puis l'installer de manière interactive, exécutez `pnpm install:vsix`. Cette commande reconstruit explicitement la webview avant d'empaqueter l'extension. Un simple `pnpm install` installe uniquement les dépendances.

Pendant le développement, la CLI est disponible depuis le monorepo :

```bash
pnpm --filter @ai-code-orchestrator/cli dev
```

La portée du paquet et les anciens identifiants de commandes sont conservés pour rester compatibles avec les intégrations existantes.

## Attribution

AI Code Orchestrator est basé sur [Roo Code](https://github.com/RooCodeInc/Roo-Code). L'implémentation conserve certaines API et certains identifiants compatibles afin que les intégrations existantes continuent de fonctionner.

## Licence

[Apache 2.0](../../LICENSE)
