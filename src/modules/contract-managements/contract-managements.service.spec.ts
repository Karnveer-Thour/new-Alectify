import { Test, TestingModule } from '@nestjs/testing';
import { ContractManagementsService } from './contract-managements.service';

describe('ContractManagementsService', () => {
  let service: ContractManagementsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ContractManagementsService],
    }).compile();

    service = module.get<ContractManagementsService>(
      ContractManagementsService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
