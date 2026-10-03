import { AssistantTurnCoordinator } from "@/src/voice/assistant-turn-coordinator";

/**
 * Public name for the shared voice orchestration. Platform differences stay
 * below this runtime in the provider/session adapters.
 */
export class VoiceRuntime extends AssistantTurnCoordinator {}
