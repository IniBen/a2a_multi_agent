import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ResearcherModule } from './researcher/researcher.module';
import { FormatterModule } from './formatter/formatter.module';
import { OrchestratorModule } from './orchestrator/orchestrator.module';

// ================================================================
// Bootstrap — Three NestJS agents, one process
//
//   :3001  Researcher Agent  — text in, structured JSON out
//   :3002  Formatter Agent   — structured JSON in, markdown out
//   :3000  Orchestrator      — user text in, final report out
//                              (coordinates both agents above)
// ================================================================

async function bootstrap() {
  const researcher = await NestFactory.create(ResearcherModule, { logger: ['log', 'warn', 'error'] });
  researcher.enableCors();
  await researcher.listen(3001);

  const formatter = await NestFactory.create(FormatterModule, { logger: ['log', 'warn', 'error'] });
  formatter.enableCors();
  await formatter.listen(3002);

  const orchestrator = await NestFactory.create(OrchestratorModule, { logger: ['log', 'warn', 'error'] });
  orchestrator.enableCors();
  await orchestrator.listen(3000);

  const sep = '─'.repeat(60);
  console.log(`\n${sep}`);
  console.log('  A2A NestJS System — Three Agents Running');
  console.log(sep);
  console.log('  🔬 Researcher  → http://localhost:3001/.well-known/agent.json');
  console.log('  📝 Formatter   → http://localhost:3002/.well-known/agent.json');
  console.log('  🎯 Orchestrator→ http://localhost:3000/.well-known/agent.json');
  console.log(sep);
  console.log('\n  Run the full two-hop pipeline (non-streaming):');
  console.log(`
  curl -s -X POST http://localhost:3000/ \\
    -H "Content-Type: application/json" \\
    -d '{"jsonrpc":"2.0","id":"1","method":"tasks/send", \\
         "params":{"id":"task-001","message":{"role":"user", \\
         "parts":[{"type":"text","text":"Tell me about Litecoin"}]}}}' | jq .
  `);
  console.log('  Run the full pipeline (streaming — watch each hop live):');
  console.log(`
  curl -N -X POST http://localhost:3000/ \\
    -H "Content-Type: application/json" \\
    -d '{"jsonrpc":"2.0","id":"2","method":"tasks/sendSubscribe", \\
         "params":{"id":"task-002","message":{"role":"user", \\
         "parts":[{"type":"text","text":"Research Ethereum"}]}}}'
  `);
  console.log(`${sep}\n`);
}

bootstrap();