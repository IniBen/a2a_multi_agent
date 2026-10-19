import { Controller, Post, Body, Res } from '@nestjs/common';
import { Response } from 'express';
import { OrchestratorService } from './orchestrator.service';
import { JSONRPCRequest, TaskSendParams, TaskQueryParams } from '../shared/a2a.types';
import { jsonRpcSuccess, jsonRpcError, RPC_ERRORS } from '../shared/a2a.utils';

@Controller('/')
export class OrchestratorTasksController {
    constructor(private readonly orchestratorService: OrchestratorService) { }

    @Post()
    async handleJsonRpc(@Body() body: JSONRPCRequest, @Res() res: Response) {
        const { id, method, params } = body;

        if (method === 'tasks/send') {
            try {
                const task = await this.orchestratorService.handleTask(params as TaskSendParams);
                return res.json(jsonRpcSuccess(id, task));
            } catch (err) {
                return res.json(jsonRpcError(id, RPC_ERRORS.INTERNAL_ERROR.code, err.message));
            }
        }

        if (method === 'tasks/sendSubscribe') {
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            res.setHeader('X-Accel-Buffering', 'no');
            res.flushHeaders();

            try {
                const stream = this.orchestratorService.streamTask(params as TaskSendParams);
                for await (const event of stream) {
                    res.write(`data: ${JSON.stringify(event)}\n\n`);
                }
            } catch (err) {
                res.write(`data: ${JSON.stringify({ error: { code: -32603, message: err.message } })}\n\n`);
            } finally {
                res.end();
            }
            return;
        }

        if (method === 'tasks/get') {
            const { id: taskId } = params as TaskQueryParams;
            const task = this.orchestratorService.getTask(taskId);
            if (!task) {
                return res.json(jsonRpcError(id, RPC_ERRORS.TASK_NOT_FOUND.code, 'Task not found'));
            }
            return res.json(jsonRpcSuccess(id, task));
        }

        return res.json(jsonRpcError(id, RPC_ERRORS.METHOD_NOT_FOUND.code, `Unknown method: ${method}`));
    }
}