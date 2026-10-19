import { v4 as uuidv4 } from 'uuid';
import {
    Task,
    TaskState,
    Message,
    Artifact,
    JSONRPCResponse,
    JSONRPCError,
    Part,
    TextPart,
} from './a2a.types';

// ── Task builders ────────────────────────────────────────────────

export function createTask(
    id: string,
    state: TaskState = 'submitted',
    sessionId?: string,
): Task {
    return {
        id,
        sessionId,
        status: {
            state,
            timestamp: new Date().toISOString(),
        },
        artifacts: [],
        history: [],
    };
}

export function updateTaskState(task: Task, state: TaskState, message?: Message): Task {
    return {
        ...task,
        status: {
            state,
            message,
            timestamp: new Date().toISOString(),
        },
    };
}

// ── Message builders ─────────────────────────────────────────────

export function createUserMessage(text: string): Message {
    return {
        role: 'user',
        parts: [{ type: 'text', text }],
    };
}

export function createAgentMessage(text: string): Message {
    return {
        role: 'agent',
        parts: [{ type: 'text', text }],
    };
}

export function extractText(message: Message): string {
    return message.parts
        .filter((p): p is TextPart => p.type === 'text')
        .map((p) => p.text)
        .join('\n');
}

// ── Artifact builders ────────────────────────────────────────────

export function createTextArtifact(name: string, text: string, description?: string): Artifact {
    return {
        name,
        description,
        parts: [{ type: 'text', text }],
    };
}

export function createDataArtifact(
    name: string,
    data: Record<string, unknown>,
    description?: string,
): Artifact {
    return {
        name,
        description,
        parts: [{ type: 'data', data }],
    };
}

// ── JSON-RPC builders ────────────────────────────────────────────

export function jsonRpcSuccess<T>(id: string | number, result: T): JSONRPCResponse<T> {
    return { jsonrpc: '2.0', id, result };
}

export function jsonRpcError(
    id: string | number,
    code: number,
    message: string,
    data?: unknown,
): JSONRPCResponse {
    return { jsonrpc: '2.0', id, error: { code, message, data } };
}

// Standard JSON-RPC error codes
export const RPC_ERRORS = {
    PARSE_ERROR: { code: -32700, message: 'Parse error' },
    INVALID_REQUEST: { code: -32600, message: 'Invalid request' },
    METHOD_NOT_FOUND: { code: -32601, message: 'Method not found' },
    INVALID_PARAMS: { code: -32602, message: 'Invalid params' },
    INTERNAL_ERROR: { code: -32603, message: 'Internal error' },
    // A2A-specific errors start at -32000
    TASK_NOT_FOUND: { code: -32001, message: 'Task not found' },
    TASK_NOT_CANCELABLE: { code: -32002, message: 'Task cannot be cancelled in its current state' },
};

// ── Misc ─────────────────────────────────────────────────────────

export function generateId(): string {
    return uuidv4();
}

export function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}