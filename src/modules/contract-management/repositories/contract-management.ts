import { BaseRepository } from '@common/repositories/base.repository';
import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ContractManagement } from '../entities/contract-management.entity';

@Injectable()
export class ContractManagementRepository extends BaseRepository<ContractManagement> {
  constructor(private dataSource: DataSource) {
    super(ContractManagement, dataSource);
  }
}
