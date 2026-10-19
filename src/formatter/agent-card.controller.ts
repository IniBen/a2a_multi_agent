import { Controller, Get } from '@nestjs/common';
import { AgentCard } from '../shared/a2a.types';

// ================================================================
// GET /.well-known/agent.json — Formatter Agent
//
// This agent accepts structured research data (a DataPart) and
// produces a polished markdown report (a TextPart artifact).
// It deliberately accepts a *different* input mode from the
// researcher to show how the orchestrator routes based on
// capability, not just availability.
// ================================================================

@Controller('.well-known')
export class FormatterAgentCardController {
    @Get('agent.json')
    getAgentCard(): AgentCard {
        return {
            name: 'Report Formatter Agent',
            description:
                'Accepts structured cryptocurrency research data and renders a polished markdown report using Claude.',
            url: 'http://localhost:3002',
            version: '1.0.0',
            capabilities: {
                streaming: true,
                pushNotifications: false,
                stateTransitionHistory: true,
            },
            defaultInputModes: ['data'],     // key difference from researcher
            defaultOutputModes: ['text'],
            skills: [
                {
                    id: 'markdown-report',
                    name: 'Markdown Report',
                    description:
                        'Turns raw structured crypto research data into a readable, well-formatted markdown report.',
                    tags: ['formatting', 'markdown', 'report'],
                    examples: [
                        'Format this research into a report',
                        'Generate a markdown report from structured data',
                    ],
                    inputModes: ['data'],
                    outputModes: ['text'],
                },
            ],
        };
    }
}