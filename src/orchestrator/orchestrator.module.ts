import { Module } from '@nestjs/common';
import { OrchestratorAgentCardController } from './agent-card.controller';
import { OrchestratorTasksController } from './tasks.controller';
import { OrchestratorService } from './orchestrator.service';
import { A2AClientService } from './a2a-client.service';

@Module({
    controllers: [OrchestratorAgentCardController, OrchestratorTasksController],
    providers: [OrchestratorService, A2AClientService],
})
export class OrchestratorModule { }