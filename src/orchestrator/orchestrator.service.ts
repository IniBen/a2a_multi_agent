import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { A2AClientService } from './a2a-client.service';
import {
    Task,
    TaskSendParams,
    AgentCard,
    TaskStatusUpdateEvent,
    Message,
    DataPart,
} from '../shared/a2a.types';
import {
    createTask,
    updateTaskState,
    createAgentMessage,
    createUserMessage,
    createTextArtifact,
    extractText,
    generateId,
    sleep,
} from '../shared/a2a.utils';

// ================================================================
// OrchestratorService — Multi-Agent Pipeline
//
// Flow (two-hop):
//   User query (text)
//     → Researcher Agent  (text → structured JSON data)
//     → Formatter Agent   (structured JSON → markdown report)
//     → Assembled result returned to caller
//
// The orchestrator reads each agent's Agent Card to understand
// what inputs/outputs it accepts before delegating.
// ================================================================

const REMOTE_AGENTS = {
    researcher: 'http://localhost:3001',
    formatter: 'http://localhost:3002',
};

const taskStore = new Map<string, Task>();

@Injectable()
export class OrchestratorService implements OnModuleInit {
    private readonly logger = new Logger(OrchestratorService.name);
    private agentCards = new Map<string, AgentCard>();

    constructor(private readonly a2aClient: A2AClientService) { }

    async onModuleInit() {
        for (const [name, url] of Object.entries(REMOTE_AGENTS)) {
            try {
                const card = await this.a2aClient.fetchAgentCard(url);
                this.agentCards.set(name, card);
                this.logger.log(`Registered: "${card.name}" — skills: ${card.skills.map(s => s.name).join(', ')}`);
            } catch (err) {
                this.logger.warn(`Could not reach ${name} at ${url}: ${err.message}`);
            }
        }
    }

    // ── Synchronous two-hop pipeline ───────────────────────────────

    async handleTask(params: TaskSendParams): Promise<Task> {
        console.log('Received task:', params);
        let task = createTask(params.id, 'submitted', params.sessionId);
        taskStore.set(params.id, task);

        const userQuery = extractText(params.message);
        this.logger.log(`Orchestrating: "${userQuery}"`);

        try {
            // ── Hop 1: Research ───────────────────────────────────────
            task = updateTaskState(task, 'working', createAgentMessage('Step 1/2 — Delegating to Researcher Agent...'));
            taskStore.set(params.id, task);

            const researcherCard = this.agentCards.get('researcher');
            if (!researcherCard) throw new Error('Researcher agent unavailable');

            const researchTask = await this.a2aClient.sendTask(researcherCard.url, {
                id: generateId(),
                sessionId: params.sessionId,
                message: createUserMessage(userQuery),
            });

            if (researchTask.status.state !== 'completed') {
                throw new Error(`Researcher returned state: ${researchTask.status.state}`);
            }

            // Extract the structured data artifact from the research task
            const dataArtifact = researchTask.artifacts?.find(a => a.name === 'structured-data');
            if (!dataArtifact) throw new Error('No structured-data artifact from researcher');

            const dataPartContent = dataArtifact.parts.find(p => p.type === 'data') as DataPart | undefined;
            if (!dataPartContent) throw new Error('structured-data artifact has no DataPart');

            this.logger.log(`Research complete for: ${(dataPartContent.data as any).fullName}`);

            // ── Hop 2: Format ─────────────────────────────────────────
            task = updateTaskState(task, 'working', createAgentMessage('Step 2/2 — Delegating to Formatter Agent...'));
            taskStore.set(params.id, task);

            const formatterCard = this.agentCards.get('formatter');
            if (!formatterCard) throw new Error('Formatter agent unavailable');

            // Build a message with a DataPart for the formatter
            const formatterMessage: Message = {
                role: 'user',
                parts: [{ type: 'data', data: dataPartContent.data }],
            };

            const formatterTask = await this.a2aClient.sendTask(formatterCard.url, {
                id: generateId(),
                sessionId: params.sessionId,
                message: formatterMessage,
            });

            if (formatterTask.status.state !== 'completed') {
                throw new Error(`Formatter returned state: ${formatterTask.status.state}`);
            }

            const reportArtifact = formatterTask.artifacts?.find(a => a.name === 'markdown-report');

            // ── Assemble final result ─────────────────────────────────
            task = {
                ...updateTaskState(task, 'completed'),
                artifacts: [
                    ...(reportArtifact ? [{ ...reportArtifact, name: 'final-report' }] : []),
                    dataArtifact,
                ],
                history: [params.message],
            };
        } catch (err) {
            this.logger.error(`Orchestration failed: ${err.message}`);
            task = updateTaskState(task, 'failed', createAgentMessage(`Pipeline failed: ${err.message}`));
        }

        taskStore.set(params.id, task);
        return task;
    }

    // ── Streaming two-hop pipeline ──────────────────────────────────
    // Emits SSE events across both hops so the caller can watch
    // the full pipeline execute in real time.

    async *streamTask(params: TaskSendParams): AsyncGenerator<object> {
        let task = createTask(params.id, 'submitted', params.sessionId);
        taskStore.set(params.id, task);
        yield { id: params.id, status: task.status, final: false };

        const userQuery = extractText(params.message);

        // ── Hop 1: Stream from researcher ──────────────────────────
        const researcherCard = this.agentCards.get('researcher');
        if (!researcherCard) {
            task = updateTaskState(task, 'failed', createAgentMessage('Researcher agent unavailable'));
            taskStore.set(params.id, task);
            yield { id: params.id, status: task.status, final: true };
            return;
        }

        task = updateTaskState(task, 'working', createAgentMessage('Step 1/2 — Researcher Agent working...'));
        taskStore.set(params.id, task);
        yield { id: params.id, status: task.status, final: false };

        const subId1 = generateId();
        let researchData: Record<string, any> | null = null;

        try {
            for await (const event of this.a2aClient.sendTaskSubscribe(researcherCard.url, {
                id: subId1,
                sessionId: params.sessionId,
                message: createUserMessage(userQuery),
            })) {
                // Capture structured data when we see the data artifact
                const e = event as any;
                if (e.artifact?.name === 'structured-data') {
                    const dataPart = e.artifact.parts?.find((p: any) => p.type === 'data');
                    if (dataPart?.data) researchData = dataPart.data;
                }

                // Forward with our task ID, label with hop context
                yield { ...e, id: params.id };
            }
        } catch (err) {
            task = updateTaskState(task, 'failed', createAgentMessage(`Researcher failed: ${err.message}`));
            taskStore.set(params.id, task);
            yield { id: params.id, status: task.status, final: true };
            return;
        }

        if (!researchData) {
            task = updateTaskState(task, 'failed', createAgentMessage('No structured data from researcher.'));
            taskStore.set(params.id, task);
            yield { id: params.id, status: task.status, final: true };
            return;
        }

        // ── Hop 2: Stream from formatter ────────────────────────────
        const formatterCard = this.agentCards.get('formatter');
        if (!formatterCard) {
            task = updateTaskState(task, 'failed', createAgentMessage('Formatter agent unavailable'));
            taskStore.set(params.id, task);
            yield { id: params.id, status: task.status, final: true };
            return;
        }

        task = updateTaskState(task, 'working', createAgentMessage('Step 2/2 — Formatter Agent writing report...'));
        taskStore.set(params.id, task);
        yield { id: params.id, status: task.status, final: false };

        const subId2 = generateId();
        const formatterMessage: Message = {
            role: 'user',
            parts: [{ type: 'data', data: researchData }],
        };

        try {
            for await (const event of this.a2aClient.sendTaskSubscribe(formatterCard.url, {
                id: subId2,
                sessionId: params.sessionId,
                message: formatterMessage,
            })) {
                const e = event as any;
                // Rename the final artifact so callers know it's the pipeline output
                if (e.artifact?.name === 'markdown-report' && e.artifact?.lastChunk) {
                    e.artifact.name = 'final-report';
                }
                yield { ...e, id: params.id };
            }
        } catch (err) {
            task = updateTaskState(task, 'failed', createAgentMessage(`Formatter failed: ${err.message}`));
            taskStore.set(params.id, task);
            yield { id: params.id, status: task.status, final: true };
            return;
        }

        task = updateTaskState(task, 'completed');
        taskStore.set(params.id, task);
        yield { id: params.id, status: task.status, final: true };
    }

    getTask(id: string): Task | undefined {
        return taskStore.get(id);
    }

    getRegisteredAgents(): { name: string; card: AgentCard }[] {
        return Array.from(this.agentCards.entries()).map(([name, card]) => ({ name, card }));
    }
}