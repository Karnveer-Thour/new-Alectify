import {
  CACHE_MANAGER,
  Inject,
  Injectable,
  OnModuleInit,
} from '@nestjs/common';
import { Cache } from 'cache-manager';
import { CacheManager } from './cache-manager';

@Injectable()
export class CacheInitializer implements OnModuleInit {
  constructor(@Inject(CACHE_MANAGER) private readonly cache: Cache) {}

  onModuleInit() {
    CacheManager.cache = this.cache; // assign once during app startup
  }
}
