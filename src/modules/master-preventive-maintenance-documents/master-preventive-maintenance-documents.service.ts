import { BaseResponseDto } from '@common/dto/base-response.dto';
import {
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { Queue } from 'bull';
import { Brackets, In } from 'typeorm';
import { FilesUploadService } from '../files-upload/files-upload.service';
import { PreventiveMaintenancesService } from '../preventive-maintenances/preventive-maintenances.service';
import { User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { MasterPreventiveMaintenanceImagesRepository } from './repositories/master-preventive-maintenance-images.repository';
import { MasterPreventiveMaintenanceFilesRepository } from './repositories/master-preventive-maintenance-files.repository';
import { ProjectsService } from 'modules/projects/projects.service';
import { IPaginationOptions, paginate } from 'nestjs-typeorm-paginate';
import { MasterPreventiveMaintenanceImages } from './entities/master-preventive-maintenance-images.entity';
import { MasterPreventiveMaintenanceFiles } from './entities/master-preventive-maintenance-files.entity';
import { dateToUTC, enumToTile } from '@common/utils/utils';
import { InjectQueue } from '@nestjs/bull';
import * as path from 'path';
import { Folders } from 'modules/preventive-maintenance-documents/models/folders.enum';
import { PreventiveMaintenanceDocumentsService } from 'modules/preventive-maintenance-documents/preventive-maintenance-documents.service';

@Injectable()
export class MasterPreventiveMaintenanceDocumentsService {
  constructor(
    private mpmImagesRepository: MasterPreventiveMaintenanceImagesRepository,
    private mpmFilesRepository: MasterPreventiveMaintenanceFilesRepository,
    @Inject(forwardRef(() => PreventiveMaintenancesService))
    private pmService: PreventiveMaintenancesService,
    private usersService: UsersService,
    private readonly fileUploadService: FilesUploadService,
    private pmDocumentsService: PreventiveMaintenanceDocumentsService,
    @InjectQueue('masterPreventiveMaintenanceDocuments')
    private readonly mpmDocumentsQueue: Queue,
  ) {}

  async create(
    token: string,
    user,
    mpmId: string,
    createPmDocumentDto,
    documents,
  ) {
    try {
      user = await this.usersService.findOneById(user.id);
      const masterPM = await this.pmService.masterFindOneById(mpmId);
      const companyId = user.branch.company.id;

      const uploadDocuments = async (
        filesArray: any[],
        type: 'images' | 'files',
      ) => {
        if (!filesArray?.length) return [];

        const uploaded = await this.fileUploadService.multiFileUpload(
          filesArray,
          'master-preventive-maintenances',
          true,
          token,
          companyId,
        );

        return uploaded.map((file) => ({
          masterPreventiveMaintenance: mpmId,
          uploadedBy: user,
          fileName: file.originalname,
          filePath: file.key,
          fileType: file.mimetype,
          updatedAt: dateToUTC(),
          createdAt: dateToUTC(),
        }));
      };

      // Upload images
      const imageDocs = await uploadDocuments(documents['images'], 'images');

      if (imageDocs.length) {
        // Set default imageUrl if not already set
        if (!masterPM.imageUrl && imageDocs[0]?.filePath) {
          const imageUrl = imageDocs[0].filePath;
          await Promise.all([
            this.pmService.updatePMByMasterId(mpmId, { imageUrl }),
            this.pmService.updateManyMasterPm([mpmId], { imageUrl }),
          ]);
        }

        await this.insertManyImages(imageDocs);
      }

      // Upload files
      const uploadedFiles = await uploadDocuments(documents['files'], 'files');

      const importedFiles = (createPmDocumentDto.importFiles || []).map(
        (importFile) => ({
          masterPreventiveMaintenance: mpmId,
          uploadedBy: importFile.uploadedBy,
          fileName: importFile.fileName,
          filePath: importFile.filePath,
          fileType: importFile.fileType,
          updatedAt: dateToUTC(),
          createdAt: dateToUTC(),
        }),
      );

      if (uploadedFiles.length || importedFiles.length) {
        await this.insertManyFiles([...uploadedFiles, ...importedFiles]);
      }

      return {
        message: 'Master preventive maintenance Document created successfully',
        data: {},
      };
    } catch (error) {
      throw error;
    }
  }

  async findImagesByMasterPmId(mpmId, options: IPaginationOptions) {
    try {
      const mpmImages = this.mpmImagesRepository
        .createQueryBuilder('mpmi')
        .where('mpmi.masterPreventiveMaintenance = :mpmId', { mpmId })
        .orderBy('mpmi.createdAt', 'ASC');

      const { items, meta, links } =
        await paginate<MasterPreventiveMaintenanceImages>(mpmImages, options);
      return {
        message: 'Get all master images successfully',
        data: items,
        links,
        meta: meta,
      };
    } catch (error) {
      throw error;
    }
  }

  async findFilesByMasterPmId(
    mpmId,
    search,
    signedUrls: boolean,
    options: IPaginationOptions,
  ) {
    try {
      MasterPreventiveMaintenanceFiles.setSignUrls(signedUrls);
      const mpmFiles = this.mpmFilesRepository
        .createQueryBuilder('mpmf')
        .where('mpmf.masterPreventiveMaintenance = :mpmId', { mpmId })
        .leftJoinAndSelect('mpmf.uploadedBy', 'uploadedBy')
        .orderBy('mpmf.createdAt', 'DESC');

      if (search) {
        mpmFiles.andWhere(
          new Brackets((qb) => {
            qb.where('mpmf.fileName ILIKE :search', {
              search: `%${search}%`,
            })
              .orWhere('uploadedBy.first_name ILIKE :search', {
                search: `%${search}%`,
              })
              .orWhere('uploadedBy.last_name ILIKE :search', {
                search: `%${search}%`,
              });
          }),
        );
      }

      const { items, meta, links } =
        await paginate<MasterPreventiveMaintenanceFiles>(mpmFiles, options);
      return {
        message: 'Get all master files successfully',
        data: items,
        links,
        meta: meta,
      };
    } catch (error) {
      throw error;
    }
  }

  async insertManyImages(data) {
    try {
      return await this.mpmImagesRepository.insert(data);
    } catch (error) {
      throw error;
    }
  }

  async insertManyFiles(data) {
    try {
      return await this.mpmFilesRepository.insert(data);
    } catch (error) {
      throw error;
    }
  }

  async uploadFilesAndImagesForPM(
    documents,
    user,
    token,
    masterPm,
    pm,
    pmDto,
    isUpdate,
  ) {
    try {
      let uploadedImages = [];
      let uploadedFiles = [];

      if (documents) {
        [uploadedImages, uploadedFiles] = await Promise.all([
          documents['images']?.length
            ? this.fileUploadService.multiFileUpload(
                documents['images'],
                'master-preventive-maintenances',
                true,
                token,
                user.branch.company.id,
              )
            : [],
          documents['files']?.length
            ? this.fileUploadService.multiFileUpload(
                documents['files'],
                'master-preventive-maintenances',
                true,
                token,
                user.branch.company.id,
              )
            : [],
        ]);
      }

      // Helper function to prepare upload data
      const prepareUploadData = (files, overrideProps) =>
        files?.map((file) => ({
          fileName: file.fileName || file.originalname,
          filePath: file.filePath || file.key,
          fileType: file.fileType || file.mimetype,
          uploadedBy: file.uploadedBy || user,
          updatedAt: dateToUTC(),
          createdAt: dateToUTC(),
          ...overrideProps,
        })) || [];

      if (pmDto.deletedImagesIds?.length) {
        await this.deleteImagesByIds(user, pmDto.deletedImagesIds);
      }
      if (pmDto.deletedFilesIds?.length) {
        if (pmDto.isRecurring === 'true') {
          await this.deleteFilesByIds(user, pmDto.deletedFilesIds);
        } else {
          await this.pmDocumentsService.deleteFilesByIds(
            user,
            pmDto.deletedFilesIds,
          );
        }
      }

      if (uploadedImages.length || pmDto.importImages?.length) {
        const uploadImages = [
          ...prepareUploadData(uploadedImages, {
            masterPreventiveMaintenance: masterPm.id,
          }),
          ...prepareUploadData(pmDto.importImages, {
            masterPreventiveMaintenance: masterPm.id,
          }),
        ];

        await this.insertManyImages(uploadImages);

        if (pm.imageUrl === null) {
          const imageUrl =
            uploadedImages[0]?.key || pmDto?.importImages?.filePath;
          if (imageUrl) {
            setTimeout(async () => {
              await Promise.all([
                this.pmService.updatePMByMasterId(masterPm.id, { imageUrl }),
                this.pmService.updateManyMasterPm([masterPm.id], { imageUrl }),
              ]);
            }, 10000);
          }
        }
      }

      if (uploadedFiles.length || pmDto.importFiles?.length) {
        const isRecurring = pmDto.isRecurring === 'true';
        const uploadFiles = [
          ...prepareUploadData(
            uploadedFiles,
            isRecurring
              ? { masterPreventiveMaintenance: masterPm.id }
              : {
                  preventiveMaintenance: pm.id,
                  folder: Folders.DOCUMENT_UPLOAD,
                  project: pm.project,
                  subProject: pm.subProject,
                },
          ),
          ...prepareUploadData(
            pmDto.importFiles,
            isRecurring
              ? { masterPreventiveMaintenance: masterPm.id }
              : {
                  preventiveMaintenance: pm.id,
                  folder: Folders.DOCUMENT_UPLOAD,
                  project: pm.project,
                  subProject: pm.subProject,
                },
          ),
        ];

        if (isRecurring) {
          await this.insertManyFiles(uploadFiles);
        } else {
          await this.pmDocumentsService.insertMany(uploadFiles);
        }
      }
    } catch (error) {
      throw error;
    }
  }

  async uploadFilesAndImagesForPMQueue(
    documents,
    user,
    token,
    masterPm,
    pm,
    pmDto,
    isUpdate,
  ) {
    return this.mpmDocumentsQueue.add('uploadFilesAndImagesForPM', {
      documents,
      user,
      token,
      masterPm,
      pm,
      pmDto,
      isUpdate,
    });
  }

  async deleteImagesByIds(user, ids) {
    try {
      await this.mpmImagesRepository.update(
        {
          id: In(ids),
        },
        {
          isActive: false,
          softDeletedAt: dateToUTC(),
          deletedBy: user.id,
        },
      );
      return {
        message: 'Master preventive maintenance images deleted',
        data: {},
      };
    } catch (error) {
      throw error;
    }
  }

  async deleteFilesByIds(user, ids) {
    try {
      await this.mpmFilesRepository.update(
        {
          id: In(ids),
        },
        {
          isActive: false,
          softDeletedAt: dateToUTC(),
          deletedBy: user.id,
        },
      );
      return {
        message: 'Master preventive maintenance files deleted',
        data: {},
      };
    } catch (error) {
      throw error;
    }
  }
}
