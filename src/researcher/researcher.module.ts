import { Module } from '@nestjs/common';
import { ResearcherAgentCardController } from './agent-card.controller';
import { ResearcherTasksController } from './tasks.controller';
import { ResearcherService } from './researcher.service';

@Module({
    controllers: [ResearcherAgentCardController, ResearcherTasksController],
    providers: [ResearcherService],
})
export class ResearcherModule { }