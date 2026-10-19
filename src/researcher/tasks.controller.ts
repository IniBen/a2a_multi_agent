import { Controller, Post, Body, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { ResearcherService } from './researcher.service';
import { JSONRPCRequest, TaskSendParams, TaskQueryParams, TaskIdParams } from '../shared/a2a.types';
import { jsonRpcSuccess, jsonRpcError, RPC_ERRORS } from '../shared/a2a.utils';

// ================================================================
// POST /
//
// Single JSON-RPC 2.0 endpoint that routes all A2A task methods.
//
// Supported methods:
//   tasks/send           — synchronous task (returns Task)
//   tasks/sendSubscribe  — streaming task (returns SSE stream)
//   tasks/get            — fetch an existing task by ID
//   tasks/cancel         — cancel a running task
// ================================================================

@Controller('/')
export class ResearcherTasksController {
    constructor(private readonly researcherService: ResearcherService) { }

    @Post()
    async handleJsonRpc(
        @Body() body: JSONRPCRequest,
        @Res() res: Response,
    ) {
        const { id, method, params } = body;

        // ── tasks/send ─────────────────────────────────────────────────
        if (method === 'tasks/send') {
            try {
                const task = await this.researcherService.handleTask(params as TaskSendParams);
                return res.json(jsonRpcSuccess(id, task));
            } catch (err) {
                return res.json(
                    jsonRpcError(id, RPC_ERRORS.INTERNAL_ERROR.code, err.message),
                );
            }
        }

        // ── tasks/sendSubscribe ─────────────────────────────────────────
        // Returns a Server-Sent Events stream instead of a single JSON body.
        // Each event is a TaskStatusUpdateEvent or TaskArtifactUpdateEvent.
        if (method === 'tasks/sendSubscribe') {
            // Set SSE headers BEFORE writing anything
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            res.setHeader('X-Accel-Buffering', 'no'); // disable nginx buffering if present
            res.flushHeaders();

            try {
                const stream = this.researcherService.streamTask(params as TaskSendParams);

                for await (const event of stream) {
                    // A2A SSE format: each event on its own "data:" line
                    res.write(`data: ${JSON.stringify(event)}\n\n`);
                }
            } catch (err) {
                const errorEvent = { error: { code: -32603, message: err.message } };
                res.write(`data: ${JSON.stringify(errorEvent)}\n\n`);
            } finally {
                res.end();
            }
            return;
        }

        // ── tasks/get ──────────────────────────────────────────────────
        if (method === 'tasks/get') {
            const { id: taskId } = params as TaskQueryParams;
            const task = this.researcherService.getTask(taskId);

            if (!task) {
                return res.json(
                    jsonRpcError(id, RPC_ERRORS.TASK_NOT_FOUND.code, RPC_ERRORS.TASK_NOT_FOUND.message),
                );
            }
            return res.json(jsonRpcSuccess(id, task));
        }

        // ── tasks/cancel ───────────────────────────────────────────────
        if (method === 'tasks/cancel') {
            const { id: taskId } = params as TaskIdParams;
            const task = this.researcherService.cancelTask(taskId);

            if (!task) {
                return res.json(
                    jsonRpcError(id, RPC_ERRORS.TASK_NOT_FOUND.code, 'Task not found or not cancelable'),
                );
            }
            return res.json(jsonRpcSuccess(id, task));
        }

        // ── Unknown method ─────────────────────────────────────────────
        return res.json(
            jsonRpcError(
                id,
                RPC_ERRORS.METHOD_NOT_FOUND.code,
                `Unknown method: ${method}`,
            ),
        );
    }
}