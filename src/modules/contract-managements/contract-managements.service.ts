import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { FilesUploadService } from 'modules/files-upload/files-upload.service';
import { OrganizationsService } from 'modules/organizations/organizations.service';
import { ProjectsService } from 'modules/projects/projects.service';
import { UsersService } from 'modules/users/users.service';
import { User } from 'modules/users/entities/user.entity';
import { CreateContractManagementDto } from './dto/create-contract-management.dto';
import {
  ContractManagementResponseDto,
  CreateContractManagementResponseDto,
} from './dto/create-contract-management-response.dto';
import { dateToUTC } from '@common/utils/utils';
import { ContractManagementsRepository } from './repositories/contract-managements.repository';
import { ContractManagementDocumentsRepository } from './repositories/contract-management-documents.repository';
import { ContractManagement } from './entities/contract-management.entity';
import { IPaginationOptions } from 'nestjs-typeorm-paginate';
import {
  GetAllContractManagementsResponseDto,
  GetOneContractManagementResponseDto,
} from './dto/get-all-contract-managements.dto';
import { UpdateContractManagementDto } from './dto/update-contract-management.dto';
import { ContractManagementDocument } from './entities/contract-management-document.entity';
import * as moment from 'moment';
import { UserTypes } from 'modules/users/models/user-types.enum';
import { OperationApisWrapper } from 'modules/operation-apis/operation-apis-wrapper';
import { Brackets } from 'typeorm';
import { ContractManagementsSortOrderEnum } from './models/contract-managements-sort-order.enum';
import { ContractManagementDocumentsService } from './contract-managements-documents.service';
import { StatusTypes } from './models/contract-management-status-types.enum';
import { CalenderStatus } from './models/contract-managements-calender-status.enum';

@Injectable()
export class ContractManagementsService {
  constructor(
    private projectsService: ProjectsService,
    private usersService: UsersService,
    private organizationsService: OrganizationsService,
    private fileUploadService: FilesUploadService,
    private contractManagementDocumentsService: ContractManagementDocumentsService,
    private contractManagementsRepository: ContractManagementsRepository,
    private contractManagementDocumentsRepository: ContractManagementDocumentsRepository,
    private readonly operationApis: OperationApisWrapper,
  ) {}

 getEventStatus(endDate: Date): CalenderStatus | null {
  const now = moment.utc();
  const contractEndDate = moment.utc(endDate);

  if (now.isAfter(contractEndDate)) {
    return CalenderStatus.DELAYED;
  }

  return null;
}

  async create(
    user: User,
    token: string,
    ccmDto: CreateContractManagementDto,
    files: Array<Express.Multer.File>,
  ): Promise<CreateContractManagementResponseDto> {
    try {
      const contactUserPayload = {
        organizationName: ccmDto.organizationName,
        email: ccmDto.email,
        first_name: ccmDto.firstName,
        last_name: ccmDto.lastName,
        user_type: UserTypes.CUSTOMER,
      };

      const contractManagementPayload = {
        projectId: ccmDto.projectId,
        description: ccmDto.description || undefined,
        contractNumber: ccmDto.contractNumber || undefined,
        contractAmount: ccmDto.contractAmount,
        comments: ccmDto.comments || undefined,
        startDate: dateToUTC(ccmDto.startDate),
        endDate: dateToUTC(ccmDto.endDate),
        isRecurring: ccmDto.isRecurring,
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

      const organization =
        await this.organizationsService.findOneByNameOrCreate(
          contactUserPayload.organizationName,
        );
      let contactUser: User;

      const isContactUserExist =
        await this.usersService.findOneByEmailWithOrganization(
          contactUserPayload.email,
        );
      if (isContactUserExist) {
        contactUser = isContactUserExist;
      } else {
        contactUser = (
          await this.operationApis.createUser(
            token,
            ccmDto.projectId,
            contactUserPayload,
          )
        ).data;
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

      const contractManagement = await this.contractManagementsRepository.save(
        cmCreate,
      );
      contractManagement['term'] = this.calculateMonths(
        contractManagement.startDate,
        contractManagement.endDate,
      );

      //upload files if any
      if (files?.length || ccmDto.importFiles?.length) {
        await this.contractManagementDocumentsService.uploadFilesForContractManagement(
          files,
          ccmDto.importFiles,
          authUser,
          token,
          contractManagement,
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
    projectId: string | null,
    contactUserById: string | null,
    isActive: boolean | null,
    isRecurring: boolean | null,
    search: string | null,
    orderField: string | null,
    orderBy: ContractManagementsSortOrderEnum | null,
    options: IPaginationOptions,
  ): Promise<GetAllContractManagementsResponseDto> {
    try {
      const limit = parseInt(options.limit as string);
      const page = parseInt(options.page as string);

      const contractMangementRecords = this.contractManagementsRepository
        .createQueryBuilder('cm')
        .leftJoinAndSelect('cm.project', 'project')
        // .leftJoinAndSelect('cm.contactUser', 'contactUser')
        .leftJoinAndSelect('cm.organization', 'organization')
        .leftJoinAndSelect(
          'cm.documents',
          'documents',
          `documents.isActive = true`,
        )
        .where('cm.isActive = true');

      if (typeof isActive === 'boolean') {
        contractMangementRecords.andWhere('cm.isActive = :isActive', {
          isActive: isActive,
        });
      }

      if (typeof isRecurring === 'boolean') {
        contractMangementRecords.andWhere('cm.isRecurring = :isRecurring', {
          isRecurring,
        });
      }

      if (projectId) {
        contractMangementRecords.andWhere('cm.project.id =:projectId', {
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
        contractMangementRecords.andWhere('cm.project.id IN (:...projectIds)', {
          projectIds,
        });
      }
      if (contactUserById) {
        contractMangementRecords.andWhere(
          'cm.contactUser.id =:contactUserById',
          {
            contactUserById,
          },
        );
      }
      if (search) {
        contractMangementRecords.andWhere(
          new Brackets((qb) => {
            qb.where('organization.name ILIKE :search', {
              search: `%${search}%`,
            })
              // .orWhere(
              //   "CONCAT(contactUser.first_name, ' ', contactUser.last_name) ILIKE :search",
              //   {
              //     search: `%${search}%`,
              //   },
              // )
              .orWhere('cm.comments ILIKE :search', {
                search: `%${search}%`,
              })
              .orWhere('cm.description ILIKE :search', {
                search: `%${search}%`,
              });
          }),
        );
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
        data: data?.map((item) => {
          return {
            ...item,
            term: this.calculateMonths(item.startDate, item.endDate),
            eventStatus: this.getEventStatus(item.endDate),
          };
        }) as any,
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
      const contract = await this.contractManagementsRepository
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

      const calculatedContract = {
        ...contract,
        eventStatus: this.getEventStatus(contract.endDate),
      };

      return {
        message: 'Get Contract successfully',
        data: calculatedContract as any,
      };
    } catch (error) {
      throw error;
    }
  }

  async updateStatus(
    id: string,
    user: User,
    status: StatusTypes,
  ): Promise<{ message: string; data: ContractManagement }> {
    try {
      const contractManagement =
        await this.contractManagementsRepository.findOne({
          where: { id: id },
          relations: ['contactUser'],
        });
      if (!contractManagement) {
        throw new NotFoundException('Contract does not exist');
      }
      if (contractManagement.contactUser.id !== user.id) {
        throw new UnauthorizedException();
      }

      contractManagement.status = status;
      await this.contractManagementsRepository.save(contractManagement);

      return {
        message: 'Contract Status was updated successfully',
        data: contractManagement,
      };
    } catch (error) {
      throw error;
    }
  }

  async update(
    user: User,
    token: string,
    id: string,
    ucmdto: UpdateContractManagementDto,
    files: Array<Express.Multer.File>,
  ): Promise<CreateContractManagementResponseDto> {
    try {
      const [authUser, existingContract, existingFilesIds] = await Promise.all([
        this.usersService.findOneById(user.id),
        this.contractManagementsRepository.findOne({ where: { id: id } }),
        this.contractManagementDocumentsService.findFilesByIds(
          ucmdto.deletedFilesIds || [],
        ),
      ]);

      if (!existingContract) {
        throw new NotFoundException('Contract does not exist');
      }

      if (ucmdto.deletedFilesIds?.length) {
        const missingFilesIds = ucmdto.deletedFilesIds.filter(
          (id) => !existingFilesIds.includes(id),
        );

        if (missingFilesIds.length > 0) {
          throw new BadRequestException(
            `Cannot delete files. The following IDs do not exist: ${missingFilesIds.join(
              ', ',
            )}`,
          );
        }
      }

      const updateContractPayload = {
        description: ucmdto.description ?? existingContract.description,
        contractNumber:
          ucmdto.contractNumber ?? existingContract.contractNumber,
        contractAmount:
          ucmdto.contractAmount ?? existingContract.contractAmount,
        comments: ucmdto.comments ?? existingContract.comments,
        startDate: dateToUTC(ucmdto.startDate) ?? existingContract.startDate,
        endDate: dateToUTC(ucmdto.endDate) ?? existingContract.endDate,
        isRecurring: ucmdto.isRecurring ?? existingContract.isRecurring,
      };

      const updateContract = await this.contractManagementsRepository.save({
        ...existingContract,
        ...updateContractPayload,
      });
      updateContract['term'] = this.calculateMonths(
        updateContract.startDate,
        updateContract.endDate,
      );

      // Handle file uploads
      if (files?.length || ucmdto.importFiles?.length) {
        await this.contractManagementDocumentsService.uploadFilesForContractManagement(
          files,
          ucmdto.importFiles,
          authUser,
          token,
          updateContract,
        );
      }

      // handle file delete if any
      if (ucmdto.deletedFilesIds?.length) {
        await this.contractManagementDocumentsService.softDeleteFilesByIds(
          authUser,
          ucmdto.deletedFilesIds,
        );
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
    const existingContract = await this.contractManagementsRepository.findOne({
      where: { id: id },
    });
    if (!existingContract) {
      throw new NotFoundException('Contract does not exist');
    }
    existingContract.isActive = false;
    existingContract.softDeletedAt = dateToUTC();
    await this.contractManagementsRepository.save(existingContract);

    return {
      data: {},
      message: `Contract #${id} has been deleted.`,
    };
  }

  async softDeleteContractManagementDocument(
    user: User,
    id: string,
    deletedComment: string,
  ) {
    const isExist = await this.contractManagementDocumentsRepository.findOne({
      where: { id: id },
    });
    if (!isExist) {
      throw new NotFoundException('Contract does not exist');
    }
    user = await this.usersService.findOneById(user.id);
    await this.contractManagementDocumentsRepository.save(
      new ContractManagementDocument({
        id: id,
        comment: deletedComment,
        isActive: false,
        softDeletedAt: dateToUTC(),
        deletedBy: user,
      }),
    );

    return {
      data: {},
      message: `This action removes a #${id} Contract Document`,
    };
  }

  private calculateMonths(startDate: Date, endDate: Date) {
    const start = moment(startDate);
    const end = moment(endDate);
    const months = end.diff(start, 'months');
    return months;
  }
}
