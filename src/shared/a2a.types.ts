// ================================================================
// A2A Protocol Types
// Based on: https://google.github.io/A2A/specification
//
// These types define the standard communication contract between
// any two A2A-compliant agents, regardless of framework or vendor.
// ================================================================

// ── Task States ──────────────────────────────────────────────────
// submitted   : task received, not yet picked up
// working     : agent is actively processing
// input-required : agent paused, needs more info from caller
// completed   : task finished successfully
// cancelled   : task was cancelled before completion
// failed      : task ended with an error

export type TaskState =
    | 'submitted'
    | 'working'
    | 'input-required'
    | 'completed'
    | 'cancelled'
    | 'failed';

// ── Parts (content units inside Messages and Artifacts) ──────────

export interface TextPart {
    type: 'text';
    text: string;
    metadata?: Record<string, unknown>;
}

export interface FilePart {
    type: 'file';
    file: {
        name?: string;
        mimeType?: string;
        bytes?: string; // base64-encoded
        uri?: string;
    };
    metadata?: Record<string, unknown>;
}

export interface DataPart {
    type: 'data';
    data: Record<string, unknown>;
    metadata?: Record<string, unknown>;
}

export type Part = TextPart | FilePart | DataPart;

// ── Message ───────────────────────────────────────────────────────
// A conversation turn. Role is 'user' for the caller, 'agent' for
// the responding agent. Messages are ephemeral context.

export interface Message {
    role: 'user' | 'agent';
    parts: Part[];
    metadata?: Record<string, unknown>;
}

// ── Artifact ──────────────────────────────────────────────────────
// The deliverable output of a task — a report, structured data,
// a file. Artifacts persist on the task and are the main thing
// the caller cares about.

export interface Artifact {
    name?: string;
    description?: string;
    parts: Part[];
    index?: number;      // position when a task produces multiple artifacts
    append?: boolean;    // true when this chunk appends to a previous artifact
    lastChunk?: boolean; // true when this is the final chunk of a streaming artifact
    metadata?: Record<string, unknown>;
}

// ── Task ──────────────────────────────────────────────────────────

export interface TaskStatus {
    state: TaskState;
    message?: Message;   // optional status message from the agent
    timestamp?: string;  // ISO-8601
}

export interface Task {
    id: string;
    sessionId?: string;
    status: TaskStatus;
    artifacts?: Artifact[];
    history?: Message[];
    metadata?: Record<string, unknown>;
}

// ── Agent Card ────────────────────────────────────────────────────
// Served at GET /.well-known/agent.json
// This is how agents discover each other's capabilities.

export interface AgentSkill {
    id: string;
    name: string;
    description?: string;
    tags?: string[];
    examples?: string[];
    inputModes?: string[];  // e.g. ['text', 'data']
    outputModes?: string[]; // e.g. ['text', 'data']
}

export interface AgentCapabilities {
    streaming?: boolean;           // supports tasks/sendSubscribe (SSE)
    pushNotifications?: boolean;   // supports push webhook callbacks
    stateTransitionHistory?: boolean;
}

export interface AgentCard {
    name: string;
    description?: string;
    url: string;           // JSON-RPC endpoint for task operations
    version: string;
    capabilities: AgentCapabilities;
    skills: AgentSkill[];
    defaultInputModes?: string[];
    defaultOutputModes?: string[];
    authentication?: {
        schemes: string[];   // e.g. ['Bearer', 'ApiKey']
        credentials?: string;
    };
}

// ── JSON-RPC 2.0 ─────────────────────────────────────────────────

export interface JSONRPCRequest {
    jsonrpc: '2.0';
    id: string | number;
    method: string;
    params?: unknown;
}

export interface JSONRPCError {
    code: number;
    message: string;
    data?: unknown;
}

export interface JSONRPCResponse<T = unknown> {
    jsonrpc: '2.0';
    id: string | number;
    result?: T;
    error?: JSONRPCError;
}

// ── Standard A2A JSON-RPC Methods & Params ───────────────────────

// tasks/send — synchronous task dispatch
export interface TaskSendParams {
    id: string;
    sessionId?: string;
    message: Message;
    historyLength?: number;
    metadata?: Record<string, unknown>;
}

// tasks/get — retrieve a task by ID
export interface TaskQueryParams {
    id: string;
    historyLength?: number;
}

// tasks/cancel — cancel a running task
export interface TaskIdParams {
    id: string;
    metadata?: Record<string, unknown>;
}

// ── Streaming Events (SSE payload for tasks/sendSubscribe) ───────

export interface TaskStatusUpdateEvent {
    id: string;
    status: TaskStatus;
    final: boolean;
    metadata?: Record<string, unknown>;
}

export interface TaskArtifactUpdateEvent {
    id: string;
    artifact: Artifact;
    final?: boolean;
    metadata?: Record<string, unknown>;
}

// Union type for anything that can come down the SSE stream
export type TaskStreamEvent = TaskStatusUpdateEvent | TaskArtifactUpdateEvent;