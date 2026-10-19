import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import * as EventSource from 'eventsource';
import {
    AgentCard,
    JSONRPCRequest,
    JSONRPCResponse,
    Task,
    TaskSendParams,
    TaskQueryParams,
    TaskIdParams,
    TaskStreamEvent,
} from '../shared/a2a.types';
import { generateId } from '../shared/a2a.utils';

// ================================================================
// A2AClientService
//
// This is what orchestrators use to talk to remote agents.
// It handles:
//   - Agent Card discovery (reading /.well-known/agent.json)
//   - tasks/send          (synchronous)
//   - tasks/sendSubscribe (streaming via SSE)
//   - tasks/get
//   - tasks/cancel
// ================================================================

@Injectable()
export class A2AClientService {
    private readonly logger = new Logger(A2AClientService.name);

    // ── Agent Card discovery ────────────────────────────────────────

    async fetchAgentCard(agentBaseUrl: string): Promise<AgentCard> {
        const url = `${agentBaseUrl}/.well-known/agent.json`;
        this.logger.log(`Fetching agent card: ${url}`);

        const { data } = await axios.get<AgentCard>(url);
        return data;
    }

    // ── tasks/send (synchronous) ────────────────────────────────────

    async sendTask(agentUrl: string, params: TaskSendParams): Promise<Task> {
        const request: JSONRPCRequest = {
            jsonrpc: '2.0',
            id: generateId(),
            method: 'tasks/send',
            params,
        };

        this.logger.log(`tasks/send → ${agentUrl} (taskId: ${params.id})`);

        const { data } = await axios.post<JSONRPCResponse<Task>>(agentUrl, request, {
            headers: { 'Content-Type': 'application/json' },
        });

        if (data.error) {
            throw new Error(`Remote agent error: [${data.error.code}] ${data.error.message}`);
        }

        return data.result!;
    }

    // ── tasks/sendSubscribe (streaming via SSE) ─────────────────────
    //
    // Unlike sendTask, this returns an AsyncGenerator that yields
    // each SSE event as it arrives. The caller can iterate over them
    // with `for await (const event of client.sendTaskSubscribe(...))`.

    async *sendTaskSubscribe(
        agentUrl: string,
        params: TaskSendParams,
    ): AsyncGenerator<TaskStreamEvent> {
        const request: JSONRPCRequest = {
            jsonrpc: '2.0',
            id: generateId(),
            method: 'tasks/sendSubscribe',
            params,
        };

        this.logger.log(`tasks/sendSubscribe → ${agentUrl} (taskId: ${params.id})`);

        // We POST the JSON-RPC body and consume the SSE response.
        // axios doesn't natively stream SSE from a POST, so we use the
        // Node.js http module directly via a streaming axios call.
        const response = await axios.post(agentUrl, request, {
            headers: {
                'Content-Type': 'application/json',
                Accept: 'text/event-stream',
            },
            responseType: 'stream',
        });

        // Parse SSE lines from the response stream
        const stream = response.data;
        let buffer = '';

        for await (const chunk of stream) {
            buffer += chunk.toString();
            const lines = buffer.split('\n');

            // Keep the last incomplete line in the buffer
            buffer = lines.pop() ?? '';

            for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed.startsWith('data:')) {
                    const raw = trimmed.slice(5).trim();
                    if (raw) {
                        try {
                            const event: TaskStreamEvent = JSON.parse(raw);
                            yield event;
                        } catch {
                            this.logger.warn(`Failed to parse SSE event: ${raw}`);
                        }
                    }
                }
            }
        }
    }

    // ── tasks/get ──────────────────────────────────────────────────

    async getTask(agentUrl: string, params: TaskQueryParams): Promise<Task> {
        const request: JSONRPCRequest = {
            jsonrpc: '2.0',
            id: generateId(),
            method: 'tasks/get',
            params,
        };

        const { data } = await axios.post<JSONRPCResponse<Task>>(agentUrl, request, {
            headers: { 'Content-Type': 'application/json' },
        });

        if (data.error) {
            throw new Error(`Remote agent error: [${data.error.code}] ${data.error.message}`);
        }

        return data.result!;
    }

    // ── tasks/cancel ──────────────────────────────────────────────

    async cancelTask(agentUrl: string, params: TaskIdParams): Promise<Task> {
        const request: JSONRPCRequest = {
            jsonrpc: '2.0',
            id: generateId(),
            method: 'tasks/cancel',
            params,
        };

        const { data } = await axios.post<JSONRPCResponse<Task>>(agentUrl, request, {
            headers: { 'Content-Type': 'application/json' },
        });

        if (data.error) {
            throw new Error(`Remote agent error: [${data.error.code}] ${data.error.message}`);
        }

        return data.result!;
    }
}