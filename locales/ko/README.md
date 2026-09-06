<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=AIOrchestrator.ai-orchestrator"><img src="https://img.shields.io/badge/VS_Code_Marketplace-007ACC?style=flat&logo=visualstudiocode&logoColor=white" alt="VS Code Marketplace"></a>
</p>

# AI Code Orchestrator

> AI 기반 개발 팀을 에디터 안에서 만나보세요.

AI Code Orchestrator는 구성 가능한 AI 에이전트로 소프트웨어를 계획, 구현, 검토하고 설명하는 VS Code 확장 프로그램이자 CLI입니다. 채팅, 코드 작업, 터미널 워크플로, 사용자 지정 역할, MCP 통합, 멀티 에이전트 오케스트레이션을 하나의 작업 공간에 결합합니다.

## 기능

- 자연어 요구 사항으로 코드 생성 및 수정
- 아키텍처를 계획하고 작업을 조율된 태스크로 분할
- 의존성을 인식하는 DAG, 병렬 실행 에이전트, 리뷰 단계, 예산 및 통제된 통합으로 작업 오케스트레이션
- **컨텍스트 최적화** — 지능형 컨텍스트 관리로 효과를 유지하면서 토큰 사용량과 비용 절감
- 변경 사항 검토, 실패 진단 및 기존 코드 개선
- 파일, 터미널, 이미지 및 외부 MCP 도구 사용
- Vercel AI Gateway와 Unbound를 포함한 제공자, 모델, 권한 및 사용자 지정 역할 구성
- 개별 역할에 모델을 할당하고 재정의가 없으면 기본 모델을 자동 상속
- 에디터 또는 명령줄에서 태스크 계속 진행

## 역할

AI Code Orchestrator는 현재 작업에 맞게 적응합니다.

- **Code** — 변경 사항 구현 및 프로젝트 파일 작업
- **Architect** — 시스템, 명세 및 마이그레이션 설계
- **Ask** — 질문에 답하고 코드 설명
- **Debug** — 근본 원인을 분리하고 수정 사항 검증
- **Reviewer** — 변경 사항을 검증하고 문제를 식별하여 품질 보장
- **Orchestrator** — 의존성을 인식하는 태스크 그래프와 병렬 에이전트를 조율하는 기본 역할
- **Custom** — 팀을 위한 특화된 워크플로 생성

각 역할은 자체 모델 구성을 사용할 수 있습니다. 역할별 모델을 지정하지 않으면 기본 모델을 상속하므로 워크플로 전반에서 성능, 속도, 비용을 쉽게 조정할 수 있습니다.

## 문서

오케스트레이션 명세를 포함한 프로젝트 문서는 [`apps/docs`](../../apps/docs)에서 확인할 수 있습니다.

## 설치

VS Code Marketplace에서 **AI Code Orchestrator** 확장 프로그램을 설치하거나 로컬에서 VSIX를 빌드하세요.

```bash
pnpm install
pnpm vsix
```

개발 중에는 모노레포에서 CLI를 사용할 수 있습니다.

```bash
pnpm --filter @ai-code-orchestrator/cli dev
```

기존 통합과의 호환성을 위해 패키지 범위와 레거시 명령 식별자는 유지됩니다.

## 출처

AI Code Orchestrator는 [Roo Code](https://github.com/RooCodeInc/Roo-Code)를 기반으로 합니다. 기존 통합이 계속 작동하도록 일부 호환 API와 식별자를 유지합니다.

## 라이선스

[Apache 2.0](../../LICENSE)
