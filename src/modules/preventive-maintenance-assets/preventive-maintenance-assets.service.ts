import { BaseResponseDto } from '@common/dto/base-response.dto';
import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MasterPreventiveMaintenances } from 'modules/preventive-maintenances/entities/master-preventive-maintenances.entity';
import { PreventiveMaintenances } from 'modules/preventive-maintenances/entities/preventive-maintenances.entity';
import { In } from 'typeorm';
import { AssetsService } from '../assets/assets.service';
import { PreventiveMaintenancesService } from '../preventive-maintenances/preventive-maintenances.service';
import { CreatePreventiveMaintenanceAssetResponseDto } from './dto/create-preventive-maintenance-asset-response.dto';
import { CreatePreventiveMaintenanceAssetDto } from './dto/create-preventive-maintenance-asset.dto';
import { MasterPreventiveMaintenanceAssets } from './entities/master-preventive-maintenance-assets.entity';
import { PreventiveMaintenanceAssets } from './entities/preventive-maintenance-assets.entity';
import { MasterPreventiveMaintenanceAssetsRepository } from './repositories/master-preventive-maintenance-assets.repository';
import { PreventiveMaintenanceAssetsRepository } from './repositories/preventive-maintenance-assets.repository';
import { dateToUTC } from '@common/utils/utils';

@Injectable()
export class PreventiveMaintenanceAssetsService {
  constructor(
    private pmAssetsRepository: PreventiveMaintenanceAssetsRepository,
    private masterPmAssetsRepository: MasterPreventiveMaintenanceAssetsRepository,
    @Inject(forwardRef(() => PreventiveMaintenancesService))
    private pmService: PreventiveMaintenancesService,
    private assetsService: AssetsService,
  ) {}

  async findAssetsByPMId(pm: PreventiveMaintenances) {
    return await this.pmAssetsRepository
      .createQueryBuilder('assets')
      .where('assets.preventiveMaintenance = :pmId', { pmId: pm.id })
      .leftJoinAndSelect('assets.asset', 'asset')
      .getMany();
  }

  async findAssetsByMasterPMId(pm: MasterPreventiveMaintenances) {
    return await this.masterPmAssetsRepository
      .createQueryBuilder('assets')
      .where('assets.masterPreventiveMaintenance = :pmId', { pmId: pm.id })
      .leftJoinAndSelect('assets.asset', 'asset')
      .getMany();
  }

  async create(
    pmId: string,
    createPMAssetDto: CreatePreventiveMaintenanceAssetDto,
  ): Promise<CreatePreventiveMaintenanceAssetResponseDto> {
    try {
      const isExist = await this.pmService.findOneByIdWithoutRelations(pmId);
      if (!isExist) {
        throw new NotFoundException('Preventive maintenance does not exist');
      }
      const asset = await this.assetsService.findOneById(
        createPMAssetDto.assetId,
      );
      const isExistAsset = await this.pmAssetsRepository
        .createQueryBuilder('assets')
        .where('assets.asset = :assetId', { assetId: asset.id })
        .andWhere('assets.preventiveMaintenance = :pmId', { pmId })
        .getOne();

      if (isExistAsset) {
        throw new BadRequestException('Asset already exist');
      }
      const pmAsset = await this.pmAssetsRepository.save(
        new PreventiveMaintenanceAssets({
          asset: asset,
          preventiveMaintenance: isExist,
        }),
      );

      return {
        message: 'Asset added to preventive maintenance',
        data: { asset: pmAsset },
      };
    } catch (error) {
      throw error;
    }
  }

  async createMany(pmId: string, assetIds: string[]) {
    return Promise.all(
      assetIds.map(
        async (assetId) =>
          await this.create(pmId, {
            assetId,
          }),
      ),
    );
  }

  async createForMaster(
    masterPmId: string,
    createPMAssetDto: CreatePreventiveMaintenanceAssetDto,
  ): Promise<CreatePreventiveMaintenanceAssetResponseDto> {
    try {
      const [isExist, findCurrentPMs] = await Promise.all([
        this.pmService.masterFindOneById(masterPmId),
        this.pmService.findFutureAndCurrentPMs(masterPmId),
      ]);
      if (!isExist) {
        throw new NotFoundException('Preventive maintenance does not exist');
      }
      const asset = await this.assetsService.findOneById(
        createPMAssetDto.assetId,
      );
      const isExistAssetForMaster = await this.masterPmAssetsRepository
        .createQueryBuilder('assets')
        .where('assets.asset = :assetId', { assetId: asset.id })
        .andWhere('assets.masterPreventiveMaintenance = :masterPmId', {
          masterPmId,
        })
        .getOne();
      if (isExistAssetForMaster) {
        throw new BadRequestException('Asset already exist');
      }
      if (findCurrentPMs.length) {
        await Promise.all(
          findCurrentPMs.map(async (pm) => {
            const isExistAsset = await this.pmAssetsRepository
              .createQueryBuilder('assets')
              .where('assets.asset = :assetId', { assetId: asset.id })
              .andWhere('assets.preventiveMaintenance = :pmId', {
                pmId: pm.id,
              })
              .getOne();
            if (!isExistAsset) {
              await this.pmAssetsRepository.save(
                new PreventiveMaintenanceAssets({
                  asset: asset,
                  preventiveMaintenance: pm,
                }),
              );
            }
          }),
        );
      }
      const pmAsset = await this.masterPmAssetsRepository.save(
        new MasterPreventiveMaintenanceAssets({
          asset: asset,
          masterPreventiveMaintenance: isExist,
        }),
      );

      return {
        message: 'Asset added to master preventive maintenance',
        data: { asset: pmAsset },
      };
    } catch (error) {
      throw error;
    }
  }

  async createManyForMaster(masterPmId: string, assetIds: string[]) {
    return Promise.all(
      assetIds.map(
        async (assetId) =>
          await this.createForMaster(masterPmId, {
            assetId,
          }),
      ),
    );
  }

  async createAndRemove(pmId: string, assetIds: string[]): Promise<void> {
    try {
      const timestamp = dateToUTC();

      const existingAssets = await this.pmAssetsRepository
        .createQueryBuilder('asset')
        .select('asset.asset', 'assetId')
        .where('asset.preventiveMaintenance = :pmId', { pmId })
        .getRawMany();

      const existingAssetSet = new Set(existingAssets.map((a) => a.assetId));
      const incomingAssetSet = new Set(assetIds);

      const toRemove = [...existingAssetSet].filter(
        (id) => !incomingAssetSet.has(id),
      );
      const toAdd = [...incomingAssetSet].filter(
        (id) => !existingAssetSet.has(id),
      );

      if (toRemove.length) {
        await this.pmAssetsRepository.delete({
          preventiveMaintenance: { id: pmId },
          asset: In(toRemove),
        });
      }

      if (toAdd.length) {
        const insertPayload = toAdd.map((assetId) => ({
          asset: assetId,
          preventiveMaintenance: pmId,
          createdAt: timestamp,
          updatedAt: timestamp,
        }));

        await this.insertMany(insertPayload);
      }
    } catch (error) {
      console.error('Error in createAndRemove (PM Assets)', error);
      throw error;
    }
  }

  async createAndRemoveMaster(
    masterPmId: string,
    assetIds: string[],
    pmIds: string[],
  ): Promise<void> {
    try {
      const timestamp = dateToUTC();
      const existingAssets = await this.masterPmAssetsRepository
        .createQueryBuilder('asset')
        .select('asset.asset', 'assetId')
        .where('asset.masterPreventiveMaintenance = :masterPmId', {
          masterPmId,
        })
        .getRawMany();

      const existingAssetIds = new Set(existingAssets.map((a) => a.assetId));
      const incomingAssetIds = new Set(assetIds);

      // Assets to remove and add
      const toRemove = [...existingAssetIds].filter(
        (id) => !incomingAssetIds.has(id),
      );
      const toAdd = [...incomingAssetIds].filter(
        (id) => !existingAssetIds.has(id),
      );

      // Delete old associations
      if (toRemove.length) {
        await this.masterPmAssetsRepository.delete({
          masterPreventiveMaintenance: { id: masterPmId },
          asset: In(toRemove),
        });

        if (pmIds.length) {
          await this.pmAssetsRepository.delete({
            preventiveMaintenance: In(pmIds),
            asset: In(toRemove),
          });
        }
      }

      // Add new associations
      if (toAdd.length) {
        const masterAssets = toAdd.map((asset) => ({
          masterPreventiveMaintenance: masterPmId,
          asset,
          createdAt: timestamp,
          updatedAt: timestamp,
        }));

        await this.insertManyMaster(masterAssets);

        if (pmIds.length) {
          const pmAssets = pmIds.flatMap((pmId) =>
            toAdd.map((asset) => ({
              preventiveMaintenance: pmId,
              asset,
              createdAt: timestamp,
              updatedAt: timestamp,
            })),
          );

          await this.insertMany(pmAssets);
        }
      }
    } catch (error) {
      console.error('Error in createAndRemoveMaster (PM Assets)', error);
      throw error;
    }
  }

  async remove(
    pmId: string,
    assetId: string,
  ): Promise<CreatePreventiveMaintenanceAssetResponseDto> {
    try {
      const isExist = await this.pmAssetsRepository.findOneBy({
        asset: { id: assetId },
        preventiveMaintenance: { id: pmId },
      });
      if (!isExist) {
        throw new NotFoundException(
          'Preventive maintenance asset does not exist',
        );
      }
      const asset = await this.pmAssetsRepository.remove(isExist);

      return {
        message: 'Asset remove to preventive maintenance',
        data: { asset },
      };
    } catch (error) {
      throw error;
    }
  }

  async deleteMany(pmIds: string[]): Promise<BaseResponseDto> {
    try {
      await this.pmAssetsRepository.delete({
        preventiveMaintenance: In(pmIds),
      });
      return {
        message: 'Assets delete to preventive maintenance',
      };
    } catch (error) {
      throw error;
    }
  }

  async removeForMaster(
    masterPmId: string,
    assetId: string,
  ): Promise<CreatePreventiveMaintenanceAssetResponseDto> {
    try {
      const [isExistForMaster, findCurrentPM, findCurrentPMs] =
        await Promise.all([
          this.masterPmAssetsRepository.findOneBy({
            asset: { id: assetId },
            masterPreventiveMaintenance: { id: masterPmId },
          }),
          this.pmService.findOneByMasterPmId(masterPmId),
          this.pmService.findFutureAndCurrentPMs(masterPmId),
        ]);
      const isExist = await this.pmAssetsRepository.findOneBy({
        asset: { id: assetId },
        preventiveMaintenance: { id: findCurrentPM.id },
      });
      if (!isExistForMaster) {
        throw new NotFoundException(
          'Preventive maintenance asset does not exist',
        );
      }
      if (isExist) {
        await this.pmAssetsRepository.delete({
          preventiveMaintenance: In(findCurrentPMs.map((pm) => pm.id)),
          asset: In([assetId]),
        });
      }
      const asset = await this.masterPmAssetsRepository.remove(
        isExistForMaster,
      );

      return {
        message: 'Asset remove to master preventive maintenance',
        data: { asset },
      };
    } catch (error) {
      throw error;
    }
  }

  async insertMany(pmAsset) {
    try {
      return await this.pmAssetsRepository.insert(pmAsset);
    } catch (error) {
      throw error;
    }
  }

  async insertManyMaster(masterPmAsset) {
    try {
      return await this.masterPmAssetsRepository.insert(masterPmAsset);
    } catch (error) {
      throw error;
    }
  }
}
