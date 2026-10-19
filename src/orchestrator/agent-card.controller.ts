import { Controller, Get } from '@nestjs/common';
import { OrchestratorService } from './orchestrator.service';
import { AgentCard } from '../shared/a2a.types';

@Controller('.well-known')
export class OrchestratorAgentCardController {
    constructor(private readonly orchestratorService: OrchestratorService) { }

    @Get('agent.json')
    getAgentCard(): AgentCard {
        return {
            name: 'Crypto Orchestrator Agent',
            description:
                'Orchestrator that accepts natural-language crypto queries and delegates to specialist agents for research, data retrieval, and formatting.',
            url: 'http://localhost:3000',
            version: '1.0.0',
            capabilities: {
                streaming: true,
                pushNotifications: false,
                stateTransitionHistory: true,
            },
            defaultInputModes: ['text'],
            defaultOutputModes: ['text', 'data'],
            skills: [
                {
                    id: 'crypto-research',
                    name: 'Crypto Research',
                    description:
                        'Accepts a natural-language query about a cryptocurrency and returns a research report by coordinating specialist agents.',
                    tags: ['crypto', 'orchestration', 'research'],
                    examples: [
                        'Tell me about Litecoin',
                        'Research Bitcoin fundamentals',
                        'Give me a full breakdown of Ethereum',
                    ],
                    inputModes: ['text'],
                    outputModes: ['text', 'data'],
                },
            ],
        };
    }

    // Bonus endpoint: inspect which remote agents are registered
    @Get('registered-agents')
    getRegisteredAgents() {
        return this.orchestratorService.getRegisteredAgents();
    }
}