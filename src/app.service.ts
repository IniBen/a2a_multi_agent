import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): string {
    return 'A2A System available. Please interact with the agents via their respective endpoints.';
  }
}
