import { Module } from '@nestjs/common';
import { FormatterAgentCardController } from './agent-card.controller';
import { FormatterTasksController } from './tasks.controller';
import { FormatterService } from './formatter.service';

@Module({
    controllers: [FormatterAgentCardController, FormatterTasksController],
    providers: [FormatterService],
})
export class FormatterModule { }