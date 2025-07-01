import { BaseResponseDto } from '@common/dto/base-response.dto';
import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AreasService } from 'modules/areas/areas.service';
import { MasterPreventiveMaintenances } from 'modules/preventive-maintenances/entities/master-preventive-maintenances.entity';
import { PreventiveMaintenances } from 'modules/preventive-maintenances/entities/preventive-maintenances.entity';
import { In } from 'typeorm';
import { PreventiveMaintenancesService } from '../preventive-maintenances/preventive-maintenances.service';
import { CreatePreventiveMaintenanceAreaResponseDto } from './dto/create-preventive-maintenance-area-response.dto';
import { CreatePreventiveMaintenanceAreaDto } from './dto/create-preventive-maintenance-area.dto';
import { MasterPreventiveMaintenanceAreas } from './entities/master-preventive-maintenance-areas.entity';
import { PreventiveMaintenanceAreas } from './entities/preventive-maintenance-areas.entity';
import { MasterPreventiveMaintenanceAreasRepository } from './repositories/master-preventive-maintenance-areas.repository';
import { PreventiveMaintenanceAreasRepository } from './repositories/preventive-maintenance-areas.repository';
import { dateToUTC } from '@common/utils/utils';

@Injectable()
export class PreventiveMaintenanceAreasService {
  constructor(
    private pmAreasRepository: PreventiveMaintenanceAreasRepository,
    private masterPmAreasRepository: MasterPreventiveMaintenanceAreasRepository,
    @Inject(forwardRef(() => PreventiveMaintenancesService))
    private pmService: PreventiveMaintenancesService,
    private areasService: AreasService,
  ) {}

  async findAreasByPMId(pm: PreventiveMaintenances) {
    return await this.pmAreasRepository
      .createQueryBuilder('areas')
      .where('areas.preventiveMaintenance = :pmId', { pmId: pm.id })
      .leftJoinAndSelect('areas.area', 'area')
      .getMany();
  }

  async findAreasByMasterPMId(pm: MasterPreventiveMaintenances) {
    return await this.masterPmAreasRepository
      .createQueryBuilder('areas')
      .where('areas.masterPreventiveMaintenance = :pmId', { pmId: pm.id })
      .leftJoinAndSelect('areas.area', 'area')
      .getMany();
  }

  async create(
    pmId: string,
    createPMAreaDto: CreatePreventiveMaintenanceAreaDto,
  ): Promise<CreatePreventiveMaintenanceAreaResponseDto> {
    try {
      const isExist = await this.pmService.findOneByIdWithoutRelations(pmId);
      if (!isExist) {
        throw new NotFoundException('Preventive maintenance does not exist');
      }
      const area = await this.areasService.findOneById(createPMAreaDto.areaId);
      const isExistArea = await this.pmAreasRepository
        .createQueryBuilder('areas')
        .where('areas.area = :areaId', { areaId: area.id })
        .andWhere('areas.preventiveMaintenance = :pmId', { pmId })
        .getOne();

      if (isExistArea) {
        throw new BadRequestException('Area already exist');
      }
      const pmArea = await this.pmAreasRepository.save(
        new PreventiveMaintenanceAreas({
          area: area,
          preventiveMaintenance: isExist,
        }),
      );

      return {
        message: 'Area added to preventive maintenance',
        data: { area: pmArea },
      };
    } catch (error) {
      throw error;
    }
  }

  async createMany(pmId: string, areaIds: string[]) {
    return Promise.all(
      areaIds.map(
        async (areaId) =>
          await this.create(pmId, {
            areaId,
          }),
      ),
    );
  }

  async createAndRemove(pmId: string, areaIds: string[]): Promise<void> {
    try {
      const timestamp = dateToUTC();

      const existingAreas = await this.pmAreasRepository
        .createQueryBuilder('area')
        .select('area.area', 'areaId')
        .where('area.preventiveMaintenance = :pmId', { pmId })
        .getRawMany();

      const existingAreaSet = new Set(existingAreas.map((a) => a.areaId));
      const incomingAreaSet = new Set(areaIds);

      const toRemove = [...existingAreaSet].filter(
        (id) => !incomingAreaSet.has(id),
      );
      const toAdd = [...incomingAreaSet].filter(
        (id) => !existingAreaSet.has(id),
      );

      if (toRemove.length) {
        await this.pmAreasRepository.delete({
          preventiveMaintenance: { id: pmId },
          area: In(toRemove),
        });
      }

      if (toAdd.length) {
        const payload = toAdd.map((areaId) => ({
          area: areaId,
          preventiveMaintenance: pmId,
          createdAt: timestamp,
          updatedAt: timestamp,
        }));
        await this.insertMany(payload);
      }
    } catch (error) {
      console.error('Error in createAndRemove (PM Areas)', error);
      throw error;
    }
  }

  async createAndRemoveMaster(
    masterPmId: string,
    areaIds: string[],
    pmIds: string[],
  ) {
    try {
      const timestamp = dateToUTC();
      const existingAreas = await this.masterPmAreasRepository
        .createQueryBuilder('area')
        .select('area.area', 'areaId')
        .where('area.masterPreventiveMaintenance = :masterPmId', {
          masterPmId,
        })
        .getRawMany();
      const existingAreaIds = new Set(existingAreas.map((a) => a.areaId));
      const incomingAreaIds = new Set(areaIds);

      // Assets to remove and add
      const toRemove = [...existingAreaIds].filter(
        (id) => !incomingAreaIds.has(id),
      );
      const toAdd = [...incomingAreaIds].filter(
        (id) => !existingAreaIds.has(id),
      );

      // Delete old associations
      if (toRemove.length) {
        await this.masterPmAreasRepository.delete({
          masterPreventiveMaintenance: { id: masterPmId },
          area: In(toRemove),
        });

        if (pmIds.length) {
          await this.pmAreasRepository.delete({
            preventiveMaintenance: In(pmIds),
            area: In(toRemove),
          });
        }
      }

      // Add new associations
      if (toAdd.length) {
        const masterAreas = toAdd.map((area) => ({
          masterPreventiveMaintenance: masterPmId,
          area,
          createdAt: timestamp,
          updatedAt: timestamp,
        }));

        await this.insertManyMaster(masterAreas);

        if (pmIds.length) {
          const pmAreas = pmIds.flatMap((pmId) =>
            toAdd.map((area) => ({
              preventiveMaintenance: pmId,
              area,
              createdAt: timestamp,
              updatedAt: timestamp,
            })),
          );

          await this.insertMany(pmAreas);
        }
      }
    } catch (error) {
      console.error('Error in createAndRemoveMaster (PM Areas)', error);
      throw error;
    }
  }

  async createForMaster(
    masterPmId: string,
    createPMAreaDto: CreatePreventiveMaintenanceAreaDto,
  ): Promise<CreatePreventiveMaintenanceAreaResponseDto> {
    try {
      const [isExist, findCurrentPMs] = await Promise.all([
        this.pmService.masterFindOneById(masterPmId),
        this.pmService.findFutureAndCurrentPMs(masterPmId),
      ]);
      if (!isExist) {
        throw new NotFoundException('Preventive maintenance does not exist');
      }
      const area = await this.areasService.findOneById(createPMAreaDto.areaId);
      const isExistAreaForMaster = await this.masterPmAreasRepository
        .createQueryBuilder('areas')
        .where('areas.area = :areaId', { areaId: area.id })
        .andWhere('areas.masterPreventiveMaintenance = :masterPmId', {
          masterPmId,
        })
        .getOne();
      if (isExistAreaForMaster) {
        throw new BadRequestException('Area already exist');
      }
      if (findCurrentPMs.length) {
        await Promise.all(
          findCurrentPMs.map(async (pm) => {
            const isExistArea = await this.pmAreasRepository
              .createQueryBuilder('areas')
              .where('areas.area = :areaId', { areaId: area.id })
              .andWhere('areas.preventiveMaintenance = :pmId', {
                pmId: pm.id,
              })
              .getOne();
            if (!isExistArea) {
              await this.pmAreasRepository.save(
                new PreventiveMaintenanceAreas({
                  area: area,
                  preventiveMaintenance: pm,
                }),
              );
            }
          }),
        );
      }
      const pmArea = await this.masterPmAreasRepository.save(
        new MasterPreventiveMaintenanceAreas({
          area: area,
          masterPreventiveMaintenance: isExist,
        }),
      );

      return {
        message: 'Area added to master preventive maintenance',
        data: { area: pmArea },
      };
    } catch (error) {
      throw error;
    }
  }

  async createManyForMaster(masterPmId: string, areaIds: string[]) {
    return Promise.all(
      areaIds.map(
        async (areaId) =>
          await this.createForMaster(masterPmId, {
            areaId,
          }),
      ),
    );
  }

  async remove(
    pmId: string,
    areaId: string,
  ): Promise<CreatePreventiveMaintenanceAreaResponseDto> {
    try {
      const isExist = await this.pmAreasRepository.findOneBy({
        area: { id: areaId },
        preventiveMaintenance: { id: pmId },
      });
      if (!isExist) {
        throw new NotFoundException(
          'Preventive maintenance area does not exist',
        );
      }
      const area = await this.pmAreasRepository.remove(isExist);

      return {
        message: 'Area remove to preventive maintenance',
        data: { area },
      };
    } catch (error) {
      throw error;
    }
  }

  async deleteMany(pmIds: string[]): Promise<BaseResponseDto> {
    try {
      await this.pmAreasRepository.delete({
        preventiveMaintenance: In(pmIds),
      });
      return {
        message: 'Areas delete to preventive maintenance',
      };
    } catch (error) {
      throw error;
    }
  }

  async removeForMaster(
    masterPmId: string,
    areaId: string,
  ): Promise<CreatePreventiveMaintenanceAreaResponseDto> {
    try {
      const [isExistForMaster, findCurrentPM, findCurrentPMs] =
        await Promise.all([
          this.masterPmAreasRepository.findOneBy({
            area: { id: areaId },
            masterPreventiveMaintenance: { id: masterPmId },
          }),
          this.pmService.findOneByMasterPmId(masterPmId),
          this.pmService.findFutureAndCurrentPMs(masterPmId),
        ]);
      const isExist = await this.pmAreasRepository.findOneBy({
        area: { id: areaId },
        preventiveMaintenance: { id: findCurrentPM.id },
      });
      if (!isExistForMaster) {
        throw new NotFoundException(
          'Preventive maintenance area does not exist',
        );
      }
      if (isExist) {
        await this.pmAreasRepository.delete({
          preventiveMaintenance: In(findCurrentPMs.map((pm) => pm.id)),
          area: In([areaId]),
        });
      }
      const area = await this.masterPmAreasRepository.remove(isExistForMaster);
      return {
        message: 'Area remove to master preventive maintenance',
        data: { area },
      };
    } catch (error) {
      throw error;
    }
  }

  async insertMany(pmAreas) {
    try {
      return await this.pmAreasRepository.insert(pmAreas);
    } catch (error) {
      throw error;
    }
  }

  async insertManyMaster(masterPmAreas) {
    try {
      return await this.masterPmAreasRepository.insert(masterPmAreas);
    } catch (error) {
      throw error;
    }
  }
}
