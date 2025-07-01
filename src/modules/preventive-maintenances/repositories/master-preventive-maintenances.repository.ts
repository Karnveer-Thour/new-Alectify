import { Injectable } from '@nestjs/common';
import { MasterPreventiveMaintenanceAssignees } from 'modules/preventive-maintenance-assignees/entities/master-preventive-maintenance-assignees.entity';
import { DataSource } from 'typeorm';
import { BaseRepository } from '@common/repositories/base.repository';
import { PreventiveMaintenanceAssignees } from '../../preventive-maintenance-assignees/entities/preventive-maintenance-assignees.entity';
import { User } from '../../users/entities/user.entity';
import { MasterPreventiveMaintenances } from '../entities/master-preventive-maintenances.entity';

@Injectable()
export class MasterPreventiveMaintenancesRepository extends BaseRepository<MasterPreventiveMaintenances> {
  constructor(private dataSource: DataSource) {
    super(MasterPreventiveMaintenances, dataSource);
  }

  async findAllRecurringMasterPms(): Promise<MasterPreventiveMaintenances[]> {
    try {
      return await this.createQueryBuilder('mpm')
        .leftJoinAndMapMany(
          'mpm.assignees',
          MasterPreventiveMaintenanceAssignees,
          'assignees',
          'assignees.master_preventive_maintenance_id = mpm.id',
        )
        .leftJoinAndMapOne(
          'assignees.user',
          User,
          'user',
          'user.id = assignees.user_id',
        )
        .where('mpm.isRecurring = true')
        .getMany();
    } catch (error) {
      throw error;
    }
  }

  async findOneAssetsAndAreas(id: string) {
    try {
      return await this.createQueryBuilder('mpm')
        .where('mpm.id = :id', { id })
        // Asset Relations
        .leftJoinAndSelect('mpm.assets', 'assets')
        .leftJoinAndSelect('assets.asset', 'asset')
        // Area Relations
        .leftJoinAndSelect('mpm.areas', 'areas')
        .leftJoinAndSelect('areas.area', 'area')
        .select([
          'mpm.id',
          'mpm.pmType',
          'mpm.taskCategory',
          'mpm.workTitle',
          'areas',
          'assets',
          'areas.area',
          'assets.asset',
        ])
        .addSelect([
          'asset.id',
          'asset.name',
          'asset.description',
          'asset.assetType',
          'asset.location',
          'area.id',
          'area.name',
          'area.description',
          'area.location',
        ])
        .getOne();
    } catch (error) {
      throw error;
    }
  }
}
