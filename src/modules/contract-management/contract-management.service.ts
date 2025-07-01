import { Injectable, NotFoundException } from '@nestjs/common';
import { FilesUploadService } from 'modules/files-upload/files-upload.service';
import { OrganizationsService } from 'modules/organizations/organizations.service';
import { ProjectsService } from 'modules/projects/projects.service';
import { UsersService } from 'modules/users/users.service';
import { User } from 'modules/users/entities/user.entity';
import { CreateContractManagementDto } from './dto/create-contract-management.dto';
import { CreateContractManagementResponseDto } from './dto/create-contract-management-response.dto';
import { dateToUTC } from '@common/utils/utils';
import { ContractManagementRepository } from './repositories/contract-management';
import { ContractManagementDocumentRepository } from './repositories/contract-management-document.repository';
import { ContractManagement } from './entities/contract-management.entity';
import { Organization } from 'modules/organizations/entities/organization.entity';
import { IPaginationOptions } from 'nestjs-typeorm-paginate';
import {
  GetAllContractManagementResponseDto,
  GetOneContractManagementResponseDto,
} from './dto/get-all-contract-management.dto';
import { UpdateContractManagementDto } from './dto/update-contract-management.dto';
import { ContractManagementDocument } from './entities/contract-management-document.entity';
import * as moment from 'moment';
@Injectable()
export class ContractManagementService {
  constructor(
    private projectsService: ProjectsService,
    private usersService: UsersService,
    private organizationsService: OrganizationsService,
    private fileUploadService: FilesUploadService,
    private contractManagementRepository: ContractManagementRepository,
    private contractManagementDocumentRepository: ContractManagementDocumentRepository,
  ) {}

  async create(
    user: User,
    token: string,
    createContractManagementDto: CreateContractManagementDto,
    files: Array<Express.Multer.File>,
  ): Promise<CreateContractManagementResponseDto> {
    try {
      const contactUserPayload = {
        organizationName: createContractManagementDto.organizationName,
        email: createContractManagementDto.email,
        first_name: createContractManagementDto.first_name,
        last_name: createContractManagementDto.last_name,
        user_type: createContractManagementDto.user_type,
      };

      const contractManagementPayload = {
        projectId: createContractManagementDto.projectId,
        description: createContractManagementDto.description || undefined,
        contractNumber: createContractManagementDto.contractNumber || undefined,
        contractAmount: createContractManagementDto.contractAmount,
        comments: createContractManagementDto.comments || undefined,
        startDate: dateToUTC(createContractManagementDto.startDate),
        endDate: dateToUTC(createContractManagementDto.endDate),
        isRecurring: createContractManagementDto.isRecurring,
      };

      const [authUser, project] = await Promise.all([
        this.usersService.findOneById(user.id),
        this.projectsService.findOneByIdWithBranch(
          contractManagementPayload.projectId,
        ),
      ]);

      if (!project) {
        throw new NotFoundException('Project does not exist');
      }

      let organization: Organization;
      let contactUser: User;

      let isContactUserExist =
        await this.usersService.findOneByEmailWithOrganization(
          contactUserPayload.email,
        );
      if (isContactUserExist) {
        organization = await this.organizationsService.findOneById(
          isContactUserExist.organization.id,
        );
        contactUser = isContactUserExist;
      } else {
        //TODO: for organization creation we need to call django api
        organization = await this.organizationsService.findOneByNameOrCreate(
          contactUserPayload.organizationName,
        );
        //TODO: for user creation we need to call django user creation api
        const cuCreate = {};
        //@ts-ignore
        contactUser = await this.usersService.createOne(cmCreate);
      }

      const cmCreate = new ContractManagement({
        project,
        organization,
        contactUser,
        description: contractManagementPayload.description,
        contractNumber: contractManagementPayload.contractNumber,
        contractAmount: contractManagementPayload.contractAmount,
        comments: contractManagementPayload.comments,
        startDate: contractManagementPayload.startDate,
        endDate: contractManagementPayload.endDate,
        isRecurring: contractManagementPayload.isRecurring,
      });

      const contractManagement = await this.contractManagementRepository.save(
        cmCreate,
      );
      contractManagement['term'] = this.calculateMonths(
        contractManagement.startDate,
        contractManagement.endDate,
      );

      //upload files if any
      if (files?.length) {
        const uploadedFiles = await this.fileUploadService.multiFileUpload(
          files,
          'contract-management',
          true,
          token,
          authUser.branch.company.id,
        );

        const documentsToCreate = uploadedFiles.map(
          (uploadedFile) =>
            new ContractManagementDocument({
              contractManagement: contractManagement.id as any,
              uploadedBy: authUser,
              fileName: uploadedFile.originalname,
              filePath: uploadedFile.key,
              fileType: uploadedFile.mimetype,
              updatedAt: dateToUTC(),
              createdAt: dateToUTC(),
            }),
        );
        await this.contractManagementDocumentRepository.insert(
          documentsToCreate,
        );
      }

      return {
        message: 'Contract Management created successfully',
        data: contractManagement as any,
      };
    } catch (error) {
      throw error;
    }
  }

  async findAll(
    user: User,
    projectId: string,
    contactUserById: string,
    orderField: string,
    orderBy: 'ASC' | 'DESC',
    options: IPaginationOptions,
    isActive?: boolean,
  ): Promise<GetAllContractManagementResponseDto> {
    try {
      const limit = parseInt(options.limit as string);
      const page = parseInt(options.page as string);

      const contractMangementRecords = this.contractManagementRepository
        .createQueryBuilder('cm')
        .leftJoinAndSelect('cm.project', 'project')
        .leftJoinAndSelect('cm.contactUser', 'contactUser')
        .leftJoinAndSelect('cm.organization', 'organization')
        .leftJoinAndSelect(
          'cm.documents',
          'documents',
          `documents.isActive = true`,
        )
        .addSelect(`DATE_PART('month', AGE(cm.endDate, cm.startDate))`, 'term');

      const activeFilter = typeof isActive === 'boolean' ? isActive : true;
      contractMangementRecords.andWhere('cm.isActive = :isActive', {
        isActive: activeFilter,
      });

      if (projectId) {
        contractMangementRecords.andWhere('project.id =:projectId', {
          projectId,
        });
      } else {
        const data = await this.projectsService.findMasterProjectsByUserId(
          user.id,
        );
        const projectIds = data.map(({ project }) => project.id);
        if (!projectIds.length) {
          return {
            message: 'Get All Contract Records Successfully',
            data: [],
          };
        }
        contractMangementRecords.where('project.id IN (:...projectIds)', {
          projectIds,
        });
      }
      if (contactUserById) {
        contractMangementRecords.andWhere('contactUser.id =:contactUserById', {
          contactUserById,
        });
      }
      if (orderField && orderBy) {
        contractMangementRecords.addOrderBy(`cm.${orderField}`, orderBy);
      } else {
        contractMangementRecords.addOrderBy('cm.createdAt', 'DESC');
      }
      const [data, count] = await contractMangementRecords
        .take(limit)
        .getManyAndCount();

      return {
        data: data?.map((item) => ({
          ...item,
          term: this.calculateMonths(item.startDate, item.endDate),
        })) as any,
        message: 'Get All Contract Records Successfully',
        meta: {
          currentPage: page,
          itemCount: data.length,
          itemsPerPage: limit,
          totalItems: count,
          totalPages: Math.ceil(count / limit),
        },
      };
    } catch (error) {
      throw error;
    }
  }

  async findOne(id: string): Promise<GetOneContractManagementResponseDto> {
    try {
      const contract = await this.contractManagementRepository
        .createQueryBuilder('cm')
        .leftJoinAndSelect('cm.project', 'project')
        .leftJoinAndSelect('cm.contactUser', 'contactUser')
        .leftJoinAndSelect('cm.organization', 'organization')
        .leftJoinAndSelect(
          'cm.documents',
          'documents',
          'documents.isActive = :isActive',
          { isActive: true },
        )
        .where('cm.id = :id', { id })
        .getOne();

      contract['term'] = this.calculateMonths(
        contract.startDate,
        contract.endDate,
      );

      return {
        message: 'Get Contract successfully',
        data: contract as any,
      };
    } catch (error) {
      throw error;
    }
  }

  async update(
    user: User,
    token: string,
    id: string,
    dto: UpdateContractManagementDto,
    files: Array<Express.Multer.File>,
  ): Promise<CreateContractManagementResponseDto> {
    try {
      const [authUser, existingContract] = await Promise.all([
        this.usersService.findOneById(user.id),
        this.contractManagementRepository.findOne({ where: { id: id } }),
      ]);

      if (!existingContract) {
        throw new NotFoundException('Contract does not exist');
      }

      const updateContract = await this.contractManagementRepository.save({
        ...existingContract,
        ...dto,
      });
      updateContract['term'] = this.calculateMonths(
        updateContract.startDate,
        updateContract.endDate,
      );

      // Handle file uploads
      if (files?.length) {
        const uploadedFiles = await this.fileUploadService.multiFileUpload(
          files,
          'contract-management',
          true,
          token,
          authUser.branch.company.id,
        );

        const documents = uploadedFiles.map(
          (uploadedFile) =>
            new ContractManagementDocument({
              contractManagement: existingContract.id as any,
              uploadedBy: authUser,
              fileName: uploadedFile.originalname,
              filePath: uploadedFile.key,
              fileType: uploadedFile.mimetype,
              updatedAt: dateToUTC(),
              createdAt: dateToUTC(),
            }),
        );

        await this.contractManagementRepository.save(documents);
      }

      return {
        message: 'Contract was updated successfully',
        data: updateContract as any,
      };
    } catch (error) {
      throw error;
    }
  }

  async softDeleteContractManagement(id: string) {
    const existingContract = await this.contractManagementRepository.findOne({
      where: { id: id },
    });
    if (!existingContract) {
      throw new NotFoundException('Contract does not exist');
    }
    existingContract.isActive = false;
    existingContract.softDeletedAt = dateToUTC();
    await this.contractManagementRepository.save(existingContract);

    return {
      data: [],
      message: `Contract #${id} has been deleted.`,
    };
  }

  async softDeleteContractManagementDocument(
    user: User,
    id: string,
    deletedComment: string,
  ) {
    const isExist = await this.contractManagementRepository.findOne({
      where: { id: id },
    });
    if (!isExist) {
      throw new NotFoundException('Contract does not exist');
    }
    user = await this.usersService.findOneById(user.id);
    await this.contractManagementDocumentRepository.save(
      new ContractManagementDocument({
        id: isExist.id,
        comment: deletedComment,
        isActive: false,
        softDeletedAt: dateToUTC(),
        deletedBy: user,
      }),
    );

    return {
      data: isExist,
      message: `This action removes a #${id} Contract`,
    };
  }

  private calculateMonths(startDate: Date, endDate: Date) {
    const start = moment(startDate);
    const end = moment(endDate);
    const months = end.diff(start, 'months');
    return months;
  }
}
