import { Injectable, Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import * as dotenv from "dotenv";
dotenv.config();
import { Task, TaskSendParams, TaskState, Artifact } from '../shared/a2a.types';
import {
    createTask,
    updateTaskState,
    createAgentMessage,
    createTextArtifact,
    createDataArtifact,
    extractText,
    sleep,
} from '../shared/a2a.utils';


const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
console.log('Claude client initialized',  process.env.ANTHROPIC_API_KEY );
const RESEARCHER_SYSTEM_PROMPT = `You are a specialist cryptocurrency research agent.

When given a query about a cryptocurrency, you MUST respond with a JSON object only — no markdown fences, no preamble, no explanation outside the JSON.

The JSON schema is:
{
  "fullName": "string",
  "symbol": "string (ticker)",
  "category": "string (e.g. Payments, Smart Contract Platform, DeFi, Layer-2)",
  "consensus": "string (e.g. Proof of Work (SHA-256), Proof of Stake)",
  "launchYear": number,
  "founder": "string",
  "useCase": "string (one sentence)",
  "keyFeatures": ["string", "string", "string", "string"],
  "summary": "string (2-3 sentences of well-written prose)"
}

If you do not recognise the cryptocurrency, respond with:
{ "error": "Unknown cryptocurrency: <name>" }

Never include text outside the JSON object.`;

const taskStore = new Map<string, Task>();

@Injectable()
export class ResearcherService {
    private readonly logger = new Logger(ResearcherService.name);

    async handleTask(params: TaskSendParams): Promise<Task> {
        let task = createTask(params.id, 'submitted', params.sessionId);
        taskStore.set(task.id, task);

        task = updateTaskState(task, 'working', createAgentMessage('Querying Claude for research...'));
        taskStore.set(task.id, task);

        const userQuery = extractText(params.message);
        this.logger.log(`Researching: "${userQuery}"`);
console.log('API key uuu: ', process.env.ANTHROPIC_API_KEY);
        try {
            const response = await client.messages.create({
                model: 'claude-opus-4-5',
                max_tokens: 1024,
                system: RESEARCHER_SYSTEM_PROMPT,
                messages: [{ role: 'user', content: userQuery }],
            });

            const raw = response.content
                .filter((b) => b.type === 'text')
                .map((b: any) => b.text)
                .join('');

            const parsed = this.parseResearchJson(raw);

            if ('error' in parsed) {
                task = {
                    ...updateTaskState(task, 'completed', createAgentMessage(parsed.error)),
                    artifacts: [createTextArtifact('not-found', parsed.error)],
                    history: [params.message],
                };
            } else {
                task = {
                    ...updateTaskState(task, 'completed'),
                    artifacts: [
                        createTextArtifact('summary', parsed.summary, 'Claude-generated summary'),
                        createDataArtifact('structured-data', parsed, 'Structured research data'),
                    ],
                    history: [params.message],
                };
            }
        } catch (err) {
            this.logger.error(`Claude API error: ${err.message}`);
            task = updateTaskState(task, 'failed', createAgentMessage(`Research failed: ${err.message}`));
        }

        taskStore.set(task.id, task);
        return task;
    }

    async *streamTask(params: TaskSendParams): AsyncGenerator<object> {
        let task = createTask(params.id, 'submitted', params.sessionId);
        taskStore.set(task.id, task);
        yield { id: task.id, status: task.status, final: false };

        await sleep(100);
        task = updateTaskState(task, 'working', createAgentMessage('Connecting to Claude...'));
        taskStore.set(task.id, task);
        yield { id: task.id, status: task.status, final: false };

        const userQuery = extractText(params.message);

        try {
            const stream = await client.messages.stream({
                model: 'claude-opus-4-5',
                max_tokens: 1024,
                system: RESEARCHER_SYSTEM_PROMPT,
                messages: [{ role: 'user', content: userQuery }],
            });

            task = updateTaskState(task, 'working', createAgentMessage('Claude is writing research...'));
            taskStore.set(task.id, task);
            yield { id: task.id, status: task.status, final: false };

            let accumulated = '';
            let chunkIndex = 0;

            for await (const delta of stream) {
                if (delta.type === 'content_block_delta' && delta.delta.type === 'text_delta') {
                    accumulated += delta.delta.text;
                    chunkIndex++;

                    if (chunkIndex % 10 === 0) {
                        const progressArtifact: Artifact = {
                            name: 'raw-output',
                            parts: [{ type: 'text', text: accumulated }],
                            index: 0,
                            append: chunkIndex > 10,
                            lastChunk: false,
                        };
                        yield { id: task.id, artifact: progressArtifact, final: false };
                    }
                }
            }

            const parsed = this.parseResearchJson(accumulated);

            if ('error' in parsed) {
                const errorArtifact: Artifact = {
                    name: 'not-found',
                    parts: [{ type: 'text', text: parsed.error }],
                    index: 0,
                    lastChunk: true,
                };
                yield { id: task.id, artifact: errorArtifact, final: false };
                task = updateTaskState(task, 'completed', createAgentMessage(parsed.error));
            } else {
                const summaryArtifact: Artifact = {
                    name: 'summary',
                    description: 'Claude-generated summary',
                    parts: [{ type: 'text', text: parsed.summary }],
                    index: 0,
                    lastChunk: true,
                };
                yield { id: task.id, artifact: summaryArtifact, final: false };

                const dataArtifact: Artifact = {
                    name: 'structured-data',
                    description: 'Structured research data',
                    parts: [{ type: 'data', data: parsed }],
                    index: 1,
                    lastChunk: true,
                };
                yield { id: task.id, artifact: dataArtifact, final: false };

                task = {
                    ...updateTaskState(task, 'completed'),
                    artifacts: [summaryArtifact, dataArtifact],
                    history: [params.message],
                };
            }

            taskStore.set(task.id, task);
            yield { id: task.id, status: task.status, final: true };
        } catch (err) {
            this.logger.error(`Claude streaming error: ${err.message}`);
            task = updateTaskState(task, 'failed', createAgentMessage(err.message));
            taskStore.set(task.id, task);
            yield { id: task.id, status: task.status, final: true };
        }
    }

    getTask(id: string): Task | undefined {
        return taskStore.get(id);
    }

    cancelTask(id: string): Task | undefined {
        const task = taskStore.get(id);
        if (!task) return undefined;
        const cancelable: TaskState[] = ['submitted', 'working', 'input-required'];
        if (!cancelable.includes(task.status.state)) return undefined;
        const cancelled = updateTaskState(task, 'cancelled');
        taskStore.set(id, cancelled);
        return cancelled;
    }

    private parseResearchJson(raw: string): Record<string, any> {
        try {
            const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            return JSON.parse(cleaned);
        } catch {
            this.logger.warn(`Could not parse Claude response as JSON: ${raw.slice(0, 200)}`);
            return { error: `Failed to parse research output: ${raw.slice(0, 100)}` };
        }
    }
}