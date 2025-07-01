import { Injectable } from '@nestjs/common';
import { FilesUploadService } from 'modules/files-upload/files-upload.service';
import { UsersService } from 'modules/users/users.service';
import { ContractManagementDocumentsRepository } from './repositories/contract-management-documents.repository';
import { User } from 'modules/users/entities/user.entity';
import { ContractManagement } from './entities/contract-management.entity';
import { ContractManagementImportFilesDto } from './dto/create-contract-management.dto';
import { dateToUTC } from '@common/utils/utils';
import { ContractManagementDocument } from './entities/contract-management-document.entity';
import { In } from 'typeorm';

@Injectable()
export class ContractManagementDocumentsService {
  constructor(
    private contractManagementDocumentsRepository: ContractManagementDocumentsRepository,
    private usersService: UsersService,
    private fileUploadService: FilesUploadService,
  ) {}

  async findFilesByIds(ids: string[]): Promise<string[]> {
    try {
      const existingIds = (
        await this.contractManagementDocumentsRepository.find({
          where: {
            id: In(ids),
            isActive: true,
          },
          select: {
            id: true,
          },
        })
      ).map((record) => record.id);

      return existingIds;
    } catch (error) {
      throw error;
    }
  }

  async uploadFilesForContractManagement(
    files: Array<Express.Multer.File> = [],
    importFiles: ContractManagementImportFilesDto[] = [],
    user: User,
    token: string,
    contractManagement: ContractManagement,
  ): Promise<{ message: string; data: any }> {
    try {
      const filesToCreate: ContractManagementDocument[] = [];
      if (files.length) {
        const uploadedFiles = await this.fileUploadService.multiFileUpload(
          files,
          'contract-management',
          true,
          token,
          user.branch.company.id,
        );

        filesToCreate.push(
          ...this.prepareUploadData(uploadedFiles, user, contractManagement),
        );
      }

      if (importFiles.length) {
        filesToCreate.push(
          ...this.prepareUploadData(importFiles, user, contractManagement),
        );
      }

      await this.contractManagementDocumentsRepository.insert(filesToCreate);

      return {
        message: 'Contract Management files uploaded',
        data: {},
      };
    } catch (error) {
      throw error;
    }
  }

  async softDeleteFilesByIds(
    user: User,
    ids: string[],
  ): Promise<{ message: string; data: any }> {
    try {
      await this.contractManagementDocumentsRepository.update(
        {
          id: In(ids),
        },
        {
          isActive: false,
          softDeletedAt: dateToUTC(),
          deletedBy: user,
        },
      );
      return {
        message: 'Contract Management files deleted',
        data: {},
      };
    } catch (error) {
      throw error;
    }
  }

  private prepareUploadData = (
    files: any[],
    user: User,
    contractManagement: ContractManagement,
  ): ContractManagementDocument[] => {
    const filesToCreate =
      files?.map(
        (file) =>
          new ContractManagementDocument({
            contractManagement: contractManagement.id as any,
            fileName: file.fileName || file.originalname,
            filePath: file.filePath || file.key,
            fileType: file.fileType || file.mimetype,
            uploadedBy: file.uploadedBy || user,
            updatedAt: dateToUTC(),
            createdAt: dateToUTC(),
          }),
      ) || [];

    return filesToCreate;
  };
}
