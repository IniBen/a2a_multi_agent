import { Controller, Get } from '@nestjs/common';
import { AgentCard } from '../shared/a2a.types';

// ================================================================
// GET /.well-known/agent.json
//
// This is the discovery endpoint every A2A-compliant agent must
// expose. Any orchestrator reads this before sending the first
// task — it tells them what the agent can do, how to call it,
// and whether it supports streaming.
// ================================================================

@Controller('.well-known')
export class ResearcherAgentCardController {
    @Get('agent.json')
    getAgentCard(): AgentCard {
        return {
            name: 'Crypto Researcher Agent',
            description:
                'Specialist agent that researches cryptocurrency topics — market data, fundamentals, and technical summaries.',
            url: 'http://localhost:3001',      // our JSON-RPC endpoint
            version: '1.0.0',
            capabilities: {
                streaming: true,                 // we support tasks/sendSubscribe
                pushNotifications: false,
                stateTransitionHistory: true,
            },
            defaultInputModes: ['text'],
            defaultOutputModes: ['text', 'data'],
            skills: [
                {
                    id: 'crypto-summary',
                    name: 'Cryptocurrency Summary',
                    description: 'Returns a structured summary of a given cryptocurrency.',
                    tags: ['crypto', 'research', 'blockchain'],
                    examples: [
                        'Tell me about Litecoin',
                        'Research Bitcoin fundamentals',
                        'What is Ethereum?',
                    ],
                    inputModes: ['text'],
                    outputModes: ['text', 'data'],
                },
                {
                    id: 'market-snapshot',
                    name: 'Market Snapshot',
                    description: 'Returns current market context for a coin — category, consensus, use case.',
                    tags: ['crypto', 'market', 'data'],
                    examples: ['Get market snapshot for Litecoin', 'Market data for Solana'],
                    inputModes: ['text'],
                    outputModes: ['data'],
                },
            ],
        };
    }
}