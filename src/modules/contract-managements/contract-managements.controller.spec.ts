import { Test, TestingModule } from '@nestjs/testing';
import { ContractManagementsController } from './contract-managements.controller';
import { ContractManagementsService } from './contract-managements.service';

describe('ContractManagementsController', () => {
  let controller: ContractManagementsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ContractManagementsController],
      providers: [ContractManagementsService],
    }).compile();

    controller = module.get<ContractManagementsController>(
      ContractManagementsController,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
