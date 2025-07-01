import { BaseResponseDto } from '@common/dto/base-response.dto';
import { CSVToJSON } from '@common/utils/csv/csv-to-json';
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { IPaginationOptions, paginate } from 'nestjs-typeorm-paginate';
import { SparePartCategoriesService } from '../spare-part-categories/spare-part-categories.service';
import { CreateSparePartResponseDto } from './dto/create-spare-part-response.dto';
import { CreateSparePartDto } from './dto/create-spare-part.dto';
import { GetAllSparePartsResponseDto } from './dto/get-all-spare-parts-response.dto';
import { GetSparePartCategoriesResponseDto } from './dto/get-project-spare-part-categories-response.dto';
import { UpdateSparePartDto } from './dto/update-spare-part.dto';
import { ProjectSparePart } from './entities/project-spare-part.entity';
import { SparePart } from './entities/spare-part.entity';
import { ProjectSparePartRepository } from './repositories/project-spare-part.repository';
import { SparePartRepository } from './repositories/spare-part.repository';
import { ManageOrdersService } from 'modules/manage-orders/manage-orders.service';
import { ProjectsService } from 'modules/projects/projects.service';
import { CreateManySparePartsDto } from './dto/create-many-spare-part.dto';
import { OrganizationsService } from 'modules/organizations/organizations.service';
import { Brackets, In } from 'typeorm';
import { DeleteSparePartDto } from './dto/delete-spare-part.dto';
import { User } from 'modules/users/entities/user.entity';
import { UsersService } from 'modules/users/users.service';
import { GetSparePartPreferredSuppliersResponseDto } from './dto/get-project-spare-part-preferred-suppliers-response.dto';
import { StatusFilters } from './models/status-filter.enum';
import { QuantityTypes } from 'modules/manage-orders/models/quantity-types.enum';
import {
  cleanHtmlTags,
  dateToUTC,
  decodeURL,
  toArray,
} from '@common/utils/utils';
import * as moment from 'moment';
import {
  SparePartDashboardMonthlyHistoryResponseDto,
  SparePartDashboardStatsResponseDto,
  SparePartsMonthlyCostResponse,
  SparePartsTotalCost,
} from './dto/get-dasboard-spare-parts-stats.dto';
import * as fs from 'fs';
// import * as csv from 'csv-parser';
import { createObjectCsvStringifier, createObjectCsvWriter } from 'csv-writer';
import { Response } from 'express';
import { FilesUploadService } from 'modules/files-upload/files-upload.service';
import { GetAdvisorySummariesResponseDto } from './dto/get-advisory-summaries-response.dto';
import { ActivityMessages } from 'modules/manage-orders/models/activity-messages.enum';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { NotificationsService } from 'modules/notifications/notifications.service';
import { UserFcmTokenService } from 'modules/users/services/user-fcm-token.service';
import { CommentsMessages } from 'modules/comments/models/comments-messages';
import { Project } from 'modules/projects/entities/project.entity';
import { UserTypes } from 'modules/users/models/user-types.enum';
import { NotificationTypes } from 'modules/notifications/models/notification-types';
import { SendMailDto } from '@core/sendgrid/dto/sendmail.dto';
import { SendGridService } from '@core/sendgrid/sendgrid.service';
import DefaultEmailTemplate from '@common/email-templates/default-email-template';

interface MonthlyTotalPrice {
  month: string;
  drawTotal: number;
  restockTotal: number;
}
@Injectable()
export class SparePartsService {
  constructor(
    private sparePartRepository: SparePartRepository,
    private projectSparePartRepository: ProjectSparePartRepository,
    private sparePartCategoriesService: SparePartCategoriesService,
    @Inject(forwardRef(() => ManageOrdersService))
    private manageOrdersService: ManageOrdersService,
    private projectsService: ProjectsService,
    private usersService: UsersService,
    private organizationsService: OrganizationsService,
    private fileUploadService: FilesUploadService,
    private userService: UsersService,
    private userFcmTokenService: UserFcmTokenService,
    private notificationService: NotificationsService,
    @InjectQueue('spareParts')
    private readonly sparePartQueue: Queue,
    private readonly sendGridService: SendGridService,
  ) {}
  async create(
    user: User,
    createSparePartDto: CreateSparePartDto,
  ): Promise<CreateSparePartResponseDto> {
    const {
      category,
      projectId,
      partNumber,
      description,
      preferredSupplierName,
    } = createSparePartDto;

    try {
      // Resolve dependencies in parallel where possible
      const [project, preferredSupplier, findCategory] = await Promise.all([
        this.projectsService.findOneById(projectId),
        this.organizationsService.findOneByNameOrCreate(preferredSupplierName),
        category
          ? this.sparePartCategoriesService.findAndCreate({
              category,
              projectId,
            })
          : Promise.resolve(null),
      ]);

      const sparePart = await this.sparePartRepository.findAndCreate(
        new SparePart({ partNumber, description }),
      );

      const projectSparePart = await this.projectSparePartRepository.save(
        new ProjectSparePart({
          ...createSparePartDto,
          projectSparePartCategory: findCategory,
          sparePart,
          project,
          preferredSupplier,
        }),
      );

      const {
        id: projectSparePartId,
        price,
        remainingQuantity,
        sparePart: { partNumber: createdPartNumber },
      } = projectSparePart;

      // Insert history
      await this.manageOrdersService.insertHistories([
        {
          project: project.id,
          projectSparePart: projectSparePartId,
          price,
          quantity: remainingQuantity,
          quantityType: QuantityTypes.PART_UPDATED,
          activity: ActivityMessages.PART_UPDATED,
          lastSparePartQuantity: remainingQuantity,
          comments: 'Spare Part Created',
          user: user.id,
        },
      ]);

      // Build email body using a helper
      const emailBody = this.buildSparePartEmailBody(
        projectSparePart,
        findCategory,
        preferredSupplier,
      );

      // Send notifications and emails in parallel
      await Promise.all([
        this.sendSparePartsNotificationsQueue(
          projectSparePart,
          project,
          user,
          `${CommentsMessages.CREATED.replace(
            '{type}',
            CommentsMessages.SPARE_PARTS,
          )}: ${createdPartNumber}`,
        ),
        this.sendSparePartsEmailQueue(
          project,
          `New Spare Part Added: ${createdPartNumber}`,
          `Hello, A new spare part has just been added. <br/> ${emailBody}`,
        ),
      ]);

      return {
        message: 'Spare part created successfully',
        data: projectSparePart,
      };
    } catch (error) {
      // Improve error logging (optional)
      console.error('Error creating spare part:', error);
      throw error;
    }
  }

  async getAdvisorySummaries(
    user: User,
    projectId?: string,
  ): Promise<GetAdvisorySummariesResponseDto> {
    try {
      let advisorySummaries;

      const queryBuilder = this.projectSparePartRepository
        .createQueryBuilder('psp')
        .leftJoinAndSelect('psp.preferredSupplier', 'preferredSupplier')
        .leftJoinAndSelect('psp.sparePart', 'sparePart')
        .leftJoinAndSelect('psp.project', 'project')
        .leftJoinAndSelect('psp.projectSparePartCategory', 'spc')
        .leftJoinAndSelect('spc.sparePartCategory', 'sparePartCategory')
        .select([
          'psp.id AS Id',
          'psp.summary AS summary',
          'project.name AS projectName',
          'preferredSupplier.name AS preferredSupplierName',
          'sparePart.partNumber AS partNumber',
          'sparePart.description AS description',
          'psp.system AS system',
          'sparePartCategory.category AS category',
        ])
        .where('psp.isAdvisory = :isAdvisory', { isAdvisory: true })
        .andWhere('psp.deletedAt IS NULL');

      const projects = await this.projectsService.findMasterProjectsByUserId(
        user.id,
      );
      const projectIds = projects.map(({ project }) => project.id);

      if (projectId) {
        if (!projectIds.includes(projectId)) {
          return {
            message:
              'You are not authorized to retrieve advisory summaries for this project!',
            data: [],
          };
        }

        advisorySummaries = await queryBuilder
          .andWhere('psp.project.id = :projectId', { projectId })
          .getRawMany();
      } else {
        if (!projectIds.length) {
          return {
            message: 'Advisory summaries retrieved successfully',
            data: [],
          };
        }

        advisorySummaries = await queryBuilder
          .andWhere('project.id IN (:...projectIds)', { projectIds })
          .getRawMany();
      }
      const formattedSummaries = advisorySummaries.map((summary) => ({
        id: summary.id,
        summary: summary.summary,
        projectName: summary.projectname,
        preferredSupplierName: summary.preferredsuppliername,
        partNumber: summary.partnumber,
        description: summary.description,
        system: summary.system,
        category: summary.category,
      }));
      return {
        message: 'Advisory summaries retrieved successfully',
        data: formattedSummaries,
      };
    } catch (error) {
      throw Error(
        'Failed to retrieve advisory summaries. Please try again later.',
      );
    }
  }

  async findAllCategories(
    token: string,
    user: User,
    projectId = null,
  ): Promise<GetSparePartCategoriesResponseDto> {
    user = await this.usersService.findOneById(user.id);
    return {
      message: 'Get all categories by project',
      data: await this.sparePartCategoriesService.findAllCategories(
        token,
        user,
        projectId,
      ),
    };
  }
  async findAllPreferredSuppliers(
    token: string,
    user: User,
    projectId = null,
  ): Promise<GetSparePartPreferredSuppliersResponseDto> {
    user = await this.usersService.findOneById(user.id);

    return {
      message: 'Get all categories by project',
      data: await this.organizationsService.findBySpareParts(user, projectId),
    };
  }
  async findAllCategoriesByProject(
    projectId: string,
  ): Promise<GetSparePartCategoriesResponseDto> {
    return {
      message: 'Get all preferred suppliers by project',
      data: await this.sparePartCategoriesService.findAllCategoriesByProject(
        projectId,
      ),
    };
  }

  async findAll(
    token: string,
    user: User,
    categoryId: string | string[],
    orderField: string,
    orderBy: 'ASC' | 'DESC',
    partNumber: string,
    description: string,
    preferredSupplierId: string | string[],
    preferredSupplierName: string,
    system: string,
    projectId: string,
    status: string,
    search: string,
    pendingOrdersOnly: string,
    options: IPaginationOptions,
  ): Promise<GetAllSparePartsResponseDto> {
    try {
      categoryId = toArray(categoryId);
      preferredSupplierId = toArray(preferredSupplierId);
      const spareParts = this.projectSparePartRepository
        .createQueryBuilder('psp')
        .leftJoinAndSelect('psp.project', 'project')
        .leftJoinAndSelect('psp.preferredSupplier', 'preferredSupplier')
        .leftJoinAndSelect(
          'psp.projectSparePartCategory',
          'projectSparePartCategory',
        )
        .leftJoinAndSelect(
          'psp.manageOrders',
          'manageOrders',
          'manageOrders.completedAt IS NULL',
        )
        .leftJoinAndSelect('psp.sparePart', 'sparePart')
        .leftJoinAndSelect(
          'projectSparePartCategory.sparePartCategory',
          'sparePartCategory',
        )
        .leftJoinAndSelect('psp.manageOrdersView', 'manageOrdersView');
      if (pendingOrdersOnly === 'true') {
        spareParts.leftJoinAndSelect('manageOrders.orderedBy', 'orderedBy');
      }

      if (projectId) {
        spareParts.where('project.id =:projectId', {
          projectId,
        });
      } else {
        const data = await this.projectsService.findMasterProjectsByUserId(
          user.id,
        );
        const projectIds = data.map(({ project }) => project.id);
        if (!projectIds.length) {
          return {
            message: 'Get all spare parts successfully',
            data: [],
            meta: {
              currentPage: Number(options.page),
              totalItems: 0,
              itemCount: Number(options.limit),
              itemsPerPage: Number(options.limit),
              totalPages: 0,
            },
          };
        }
        spareParts.where('project.id IN (:...projectIds)', {
          projectIds,
        });
      }
      if (categoryId.length) {
        spareParts.andWhere('sparePartCategory.id IN (:...categoryId)', {
          categoryId,
        });
      }
      if (status) {
        if (status === StatusFilters.LOW_INVENTORY) {
          spareParts
            .andWhere('psp.remainingQuantity <= psp.minimumQuantity')
            .andWhere('psp.remainingQuantity != 0');
        }
        if (status === StatusFilters.OUT_OF_STOCK) {
          spareParts.andWhere('psp.remainingQuantity <= 0');
        }
        if (status === StatusFilters.NORMAL) {
          spareParts.andWhere('psp.remainingQuantity > psp.minimumQuantity');
        }
      }
      if (partNumber) {
        spareParts.andWhere('sparePart.partNumber ILIKE :partNumber', {
          partNumber: `%${partNumber}%`,
        });
      }
      if (description) {
        spareParts.andWhere('sparePart.description ILIKE :description', {
          description: `%${description}%`,
        });
      }
      if (preferredSupplierId.length) {
        spareParts.andWhere(
          'preferredSupplier.id IN (:...preferredSupplierId)',
          {
            preferredSupplierId,
          },
        );
      }
      if (preferredSupplierName) {
        spareParts.andWhere(
          'preferredSupplier.name  ILIKE =:preferredSupplierName',
          {
            preferredSupplierName,
          },
        );
      }
      if (system) {
        spareParts.andWhere('psp.system ILIKE :system', {
          system: `%${system}%`,
        });
      }

      if (search) {
        spareParts.andWhere(
          new Brackets((qb) => {
            qb.where('project.name ILIKE :search', {
              search: `%${search}%`,
            })
              .orWhere('preferredSupplier.name ILIKE :search', {
                search: `%${search}%`,
              })
              .orWhere('sparePart.partNumber ILIKE :search', {
                search: `%${search}%`,
              })
              .orWhere('sparePart.description ILIKE :search', {
                search: `%${search}%`,
              })
              .orWhere('sparePartCategory.category ILIKE :search', {
                search: `%${search}%`,
              })
              .orWhere('psp.system ILIKE :search', {
                search: `%${search}%`,
              })
              .orWhere('psp.comments ILIKE :search', {
                search: `%${search}%`,
              });
          }),
        );
      }

      if (pendingOrdersOnly === 'true') {
        spareParts.andWhere('manageOrders.id IS NOT NULL');
      }

      if (orderField && orderBy) {
        if (orderField === 'category') {
          spareParts.addOrderBy(`sparePartCategory.category`, orderBy);
        } else if (orderField === 'partNumber') {
          spareParts.addOrderBy(`sparePart.partNumber`, orderBy);
        } else if (orderField === 'description') {
          spareParts.addOrderBy(`sparePart.description`, orderBy);
        } else if (orderField === 'status') {
          spareParts.addOrderBy(`manageOrdersView.pendingItems`, orderBy);
        } else {
          spareParts.addOrderBy(`psp.${orderField}`, orderBy);
        }
      } else if (pendingOrdersOnly === 'true') {
        spareParts.orderBy('manageOrders.created_at', 'DESC');
      } else {
        spareParts.orderBy('psp.created_at', 'DESC');
        // spareParts.orderBy('manageOrdersView.pendingItems', 'ASC');
      }

      const { items, meta, links } = await paginate<ProjectSparePart>(
        spareParts,
        options,
      );

      return {
        message: 'Get all spare parts successfully',
        data: items,
        links,
        meta: meta,
      };
    } catch (error) {
      throw error;
    }
  }

  async findAllByBranch(
    user: User,
    projectId: string,
    categoryId: string | string[],
    orderField: string,
    orderBy: 'ASC' | 'DESC',
    partNumber: string,
    description: string,
    preferredSupplierId: string | string[],
    preferredSupplierName: string,
    system: string,
    status: string,
    search: string,
    options: IPaginationOptions,
  ): Promise<GetAllSparePartsResponseDto> {
    try {
      categoryId = toArray(categoryId);
      preferredSupplierId = toArray(preferredSupplierId);
      user = await this.usersService.findOneById(user.id);
      const spareParts = this.projectSparePartRepository
        .createQueryBuilder('psp')
        .leftJoinAndSelect('psp.project', 'project')
        .leftJoinAndSelect('psp.preferredSupplier', 'preferredSupplier')
        .leftJoinAndSelect(
          'psp.projectSparePartCategory',
          'projectSparePartCategory',
        )
        .leftJoinAndSelect('psp.sparePart', 'sparePart')
        .leftJoinAndSelect(
          'projectSparePartCategory.sparePartCategory',
          'sparePartCategory',
        )
        .leftJoinAndSelect('psp.manageOrdersView', 'manageOrdersView')
        .where('project.branch =:branchId', {
          branchId: user.branch.id,
        });
      if (projectId) {
        spareParts.where('project.id =:projectId', {
          projectId,
        });
      }
      if (categoryId.length) {
        spareParts.andWhere('sparePartCategory.id IN (:...categoryId)', {
          categoryId,
        });
      }
      if (status) {
        if (status === StatusFilters.LOW_INVENTORY) {
          spareParts
            .andWhere('psp.remainingQuantity <= psp.minimumQuantity')
            .andWhere('psp.remainingQuantity != 0');
        }
        if (status === StatusFilters.OUT_OF_STOCK) {
          spareParts.andWhere('psp.remainingQuantity <= 0');
        }
        if (status === StatusFilters.NORMAL) {
          spareParts.andWhere('psp.remainingQuantity > psp.minimumQuantity');
        }
      }
      if (partNumber) {
        spareParts.andWhere('sparePart.partNumber ILIKE :partNumber', {
          partNumber: `%${partNumber}%`,
        });
      }
      if (description) {
        spareParts.andWhere('sparePart.description ILIKE :description', {
          description: `%${description}%`,
        });
      }
      if (preferredSupplierId.length) {
        spareParts.andWhere(
          'preferredSupplier.id IN (:...preferredSupplierId)',
          {
            preferredSupplierId,
          },
        );
      }
      if (preferredSupplierName) {
        spareParts.andWhere(
          'preferredSupplier.name  ILIKE =:preferredSupplierName',
          {
            preferredSupplierName,
          },
        );
      }
      if (system) {
        spareParts.andWhere('psp.system ILIKE :system', {
          system: `%${system}%`,
        });
      }

      if (search) {
        spareParts.andWhere(
          new Brackets((qb) => {
            qb.where('project.name ILIKE :search', {
              search: `%${search}%`,
            })
              .orWhere('preferredSupplier.name ILIKE :search', {
                search: `%${search}%`,
              })
              .orWhere('sparePart.partNumber ILIKE :search', {
                search: `%${search}%`,
              })
              .orWhere('sparePart.description ILIKE :search', {
                search: `%${search}%`,
              })
              .orWhere('sparePartCategory.category ILIKE :search', {
                search: `%${search}%`,
              });
          }),
        );
      }
      if (orderField && orderBy) {
        if (orderField === 'category') {
          spareParts.addOrderBy(`sparePartCategory.category`, orderBy);
        } else if (orderField === 'partNumber') {
          spareParts.addOrderBy(`sparePart.partNumber`, orderBy);
        } else if (orderField === 'description') {
          spareParts.addOrderBy(`sparePart.description`, orderBy);
        } else if (orderField === 'status') {
          spareParts.addOrderBy(`manageOrdersView.pendingItems`, orderBy);
        } else {
          spareParts.addOrderBy(`psp.${orderField}`, orderBy);
        }
      } else {
        spareParts.orderBy('psp.created_at', 'DESC');
      }
      const { items, meta, links } = await paginate<ProjectSparePart>(
        spareParts,
        options,
      );

      return {
        message: 'Get all global spare parts successfully',
        data: items,
        links,
        meta: meta,
      };
    } catch (error) {
      throw error;
    }
  }

  async findPartsById(
    token: string,
    user: User,
    id: string,
    options: IPaginationOptions,
  ): Promise<GetAllSparePartsResponseDto> {
    try {
      let findPart = null;
      if (
        id.match(
          '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$',
        )
      ) {
        findPart = await this.findById(id);
      }
      user = await this.usersService.findOneById(user.id);
      const spareParts = this.projectSparePartRepository
        .createQueryBuilder('psp')
        .leftJoinAndSelect('psp.project', 'project')
        .leftJoinAndSelect('psp.preferredSupplier', 'preferredSupplier')
        .leftJoinAndSelect(
          'psp.projectSparePartCategory',
          'projectSparePartCategory',
        )
        .leftJoinAndSelect('psp.sparePart', 'sparePart')
        .leftJoinAndSelect(
          'projectSparePartCategory.sparePartCategory',
          'sparePartCategory',
        )
        .leftJoinAndSelect('psp.manageOrdersView', 'manageOrdersView');

      spareParts.where('project.branch =:branchId', {
        branchId: user.branch.id,
      });
      if (findPart) {
        spareParts
          .andWhere('psp.id !=:id', {
            id: id,
          })
          .andWhere('sparePart.partNumber =:partNumber', {
            partNumber: findPart.sparePart.partNumber,
          });
      } else {
        spareParts.andWhere(
          'LOWER(sparePart.partNumber) = LOWER(:partNumber)',
          {
            partNumber: id,
          },
        );
      }
      const { items, meta, links } = await paginate<ProjectSparePart>(
        spareParts,
        options,
      );
      return {
        message: 'Get all spare parts successfully',
        data: items,
        links,
        meta: meta,
      };
    } catch (error) {
      throw error;
    }
  }

  async findAllByProject(
    user: any,
    projectId: string,
    categoryId: string | string[],
    orderField: string,
    orderBy: 'ASC' | 'DESC',
    partNumber: string,
    description: string,
    preferredSupplierName: string,
    system: string,
    options: IPaginationOptions,
  ): Promise<GetAllSparePartsResponseDto> {
    try {
      categoryId = toArray(categoryId);

      const spareParts = this.projectSparePartRepository
        .createQueryBuilder('psp')
        .leftJoinAndSelect('psp.project', 'project')
        .leftJoinAndSelect('psp.preferredSupplier', 'preferredSupplier')
        .leftJoinAndSelect(
          'psp.projectSparePartCategory',
          'projectSparePartCategory',
        )
        .leftJoinAndSelect('psp.sparePart', 'sparePart')
        .leftJoinAndSelect(
          'projectSparePartCategory.sparePartCategory',
          'sparePartCategory',
        )
        .leftJoinAndSelect('psp.manageOrdersView', 'manageOrdersView')
        .where('project.id =:projectId', { projectId });

      if (categoryId.length) {
        spareParts.andWhere(
          'psp.projectSparePartCategory IN (:...categoryId)',
          {
            categoryId,
          },
        );
      }
      if (partNumber) {
        spareParts.andWhere('sparePart.partNumber ILIKE :partNumber', {
          partNumber: `%${partNumber}%`,
        });
      }
      if (description) {
        spareParts.andWhere('sparePart.description ILIKE :description', {
          description: `%${description}%`,
        });
      }
      if (preferredSupplierName) {
        spareParts.andWhere(
          'preferredSupplier.name ILIKE :preferredSupplierName',
          {
            preferredSupplierName: `%${preferredSupplierName}%`,
          },
        );
      }
      if (system) {
        spareParts.andWhere('psp.system ILIKE :system', {
          system: `%${system}%`,
        });
      }

      if (orderField && orderBy) {
        if (orderField === 'category') {
          spareParts.addOrderBy(`sparePartCategory.category`, orderBy);
        } else if (orderField === 'partNumber') {
          spareParts.addOrderBy(`sparePart.partNumber`, orderBy);
        } else if (orderField === 'description') {
          spareParts.addOrderBy(`sparePart.description`, orderBy);
        } else if (orderField === 'status') {
          spareParts.addOrderBy(`manageOrdersView.pendingItems`, orderBy);
        } else {
          spareParts.addOrderBy(`psp.${orderField}`, orderBy);
        }
      } else {
        // spareParts.orderBy('psp.created_at', 'DESC');
        spareParts.orderBy('manageOrdersView.pendingItems', 'ASC');
      }

      const { items, meta, links } = await paginate<ProjectSparePart>(
        spareParts,
        options,
      );

      return {
        message: 'Get all spare parts successfully',
        data: items,
        links,
        meta: meta,
      };
    } catch (error) {
      throw error;
    }
  }

  async findAllByAsset(
    user: any,
    projectId: string,
    assetId: string,
    categoryId: string | string[],
    orderField: string,
    orderBy: 'ASC' | 'DESC',
    partNumber: string,
    description: string,
    preferredSupplierName: string,
    system: string,
    options: IPaginationOptions,
  ): Promise<GetAllSparePartsResponseDto> {
    try {
      categoryId = toArray(categoryId);
      const spareParts = this.projectSparePartRepository
        .createQueryBuilder('psp')
        .leftJoinAndSelect('psp.project', 'project')
        .leftJoinAndSelect('psp.preferredSupplier', 'preferredSupplier')
        .leftJoinAndSelect(
          'psp.projectSparePartCategory',
          'projectSparePartCategory',
        )
        .leftJoinAndSelect('psp.sparePart', 'sparePart')
        .leftJoinAndSelect(
          'projectSparePartCategory.sparePartCategory',
          'sparePartCategory',
        )
        .leftJoinAndSelect('psp.manageOrdersView', 'manageOrdersView')
        .leftJoin('psp.manageOrderHistories', 'manageOrderHistories')
        .leftJoinAndSelect('manageOrderHistories.asset', 'asset')
        .where('project.id =:projectId', { projectId })
        .andWhere('asset.id =:assetId', { assetId });

      if (categoryId.length) {
        spareParts.andWhere(
          'psp.projectSparePartCategory IN (:...categoryId)',
          {
            categoryId,
          },
        );
      }
      if (partNumber) {
        spareParts.andWhere('sparePart.partNumber ILIKE :partNumber', {
          partNumber: `%${partNumber}%`,
        });
      }
      if (description) {
        spareParts.andWhere('sparePart.description ILIKE :description', {
          description: `%${description}%`,
        });
      }
      if (preferredSupplierName) {
        spareParts.andWhere(
          'psp.preferredSupplierName ILIKE :preferredSupplierName',
          {
            preferredSupplierName: `%${preferredSupplierName}%`,
          },
        );
      }
      if (system) {
        spareParts.andWhere('psp.system ILIKE :system', {
          system: `%${system}%`,
        });
      }

      if (orderField && orderBy) {
        if (orderField === 'category') {
          spareParts.addOrderBy(`sparePartCategory.category`, orderBy);
        } else if (orderField === 'partNumber') {
          spareParts.addOrderBy(`sparePart.partNumber`, orderBy);
        } else if (orderField === 'description') {
          spareParts.addOrderBy(`sparePart.description`, orderBy);
        } else {
          spareParts.addOrderBy(`psp.${orderField}`, orderBy);
        }
      } else {
        spareParts.orderBy('psp.created_at', 'DESC');
      }

      const { items, meta, links } = await paginate<ProjectSparePart>(
        spareParts,
        options,
      );

      return {
        message: 'Get all spare parts successfully',
        data: items,
        links,
        meta: meta,
      };
    } catch (error) {
      throw error;
    }
  }

  async update(
    user: User,
    id: string,
    dto: UpdateSparePartDto,
  ): Promise<CreateSparePartResponseDto> {
    try {
      const existing = await this.projectSparePartRepository.findOne({
        where: { id },
        relations: [
          'projectSparePartCategory',
          'projectSparePartCategory.sparePartCategory',
          'preferredSupplier',
          'sparePart',
          'project',
        ],
      });

      if (!existing) throw new NotFoundException('Spare part does not exist');

      const {
        category,
        projectId,
        partNumber,
        description,
        preferredSupplierId,
      } = dto;

      const [findCategory, project, preferredSupplier] = await Promise.all([
        category
          ? this.sparePartCategoriesService.findAndCreate({
              category,
              projectId,
            })
          : null,
        this.projectsService.findOneById(projectId),
        this.organizationsService.findOneById(preferredSupplierId),
      ]);

      const sparePart = await this.sparePartRepository.findAndCreate(
        new SparePart({ partNumber, description }),
      );

      if (description !== sparePart.description) {
        sparePart.description = description;
        await this.sparePartRepository.save(sparePart);
      }

      const projectSparePart = await this.projectSparePartRepository.save(
        new ProjectSparePart({
          ...existing,
          ...dto,
          projectSparePartCategory: findCategory,
          sparePart,
          project,
          preferredSupplier,
        }),
      );

      const updatedFields: string[] = [];

      const fieldMap: { [key: string]: [any, any] } = {
        Category: [
          existing?.projectSparePartCategory?.sparePartCategory?.category,
          category,
        ],
        Note: [existing.comments, dto.comments],
        Description: [existing.sparePart.description, description],
        'Firmware Version': [existing.firmwareVersion, dto.firmwareVersion],
        'Minimum Quantity': [existing.minimumQuantity, dto.minimumQuantity],
        'Part Number': [existing.sparePart.partNumber, dto.partNumber],
        Vendor: [existing.preferredSupplier.name, dto.preferredSupplierName],
        Price: [existing.price, dto.price],
        Rack: [existing.rack, dto.rack],
        'Quantity In Hand': [existing.remainingQuantity, dto.remainingQuantity],
        Room: [existing.room, dto.room],
        Shelf: [existing.shelf, dto.shelf],
        System: [existing.system, dto.system],
      };

      for (const [key, [oldVal, newVal]] of Object.entries(fieldMap)) {
        if (oldVal !== newVal) updatedFields.push(key);
      }

      const comments = `Spare Part Updated Fields: ${updatedFields.join(', ')}`;
      if (updatedFields.length > 0) {
        await this.manageOrdersService.insertHistories([
          {
            project: existing.project.id,
            projectSparePart: existing.id,
            price: existing.price,
            quantity: existing.remainingQuantity,
            quantityType: QuantityTypes.PART_UPDATED,
            activity: ActivityMessages.PART_UPDATED,
            lastSparePartQuantity: existing.remainingQuantity,
            comments,
            user: user.id,
          },
        ]);

        // Build email body using a helper
        const emailBody = this.buildSparePartEmailBody(
          projectSparePart,
          findCategory,
          preferredSupplier,
        );
        //send spare parts notification
        await Promise.all([
          this.sendSparePartsNotificationsQueue(
            existing,
            project,
            user,
            `${CommentsMessages.UPDATED.replace(
              '{type}',
              CommentsMessages.SPARE_PARTS,
            )} fields ${updatedFields.join(', ')} for ${sparePart.partNumber}`,
          ),
          this.sendSparePartsEmailQueue(
            project,
            `Part Updated: ${sparePart.partNumber}`,
            `Hello, Spare part have been updated. <br/> ${emailBody}`,
          ),
        ]);
      }

      return {
        message: 'Spare part updated successfully',
        data: projectSparePart,
      };
    } catch (error) {
      throw error;
    }
  }

  async updateImage(
    user: User,
    token: string,
    id: string,
    uploadedImage: Express.Multer.File,
  ): Promise<CreateSparePartResponseDto> {
    try {
      if (!uploadedImage) {
        throw new BadRequestException('Image is required');
      }
      user = await this.userService.findOneById(user.id);
      const isExist = await this.sparePartRepository.findOneBy({
        id,
      });

      if (!isExist) {
        throw new NotFoundException('Spare parts does not exist');
      }
      isExist.imageUrl = isExist.imageUrl ? decodeURL(isExist.imageUrl) : null;
      if (isExist.imageUrl) {
        await this.fileUploadService.fileDelete(isExist.imageUrl);
      }
      const fileUpload = await this.fileUploadService.fileUpload(
        uploadedImage,
        'spare-parts',
        true,
        token,
        user.branch.company.id,
      );
      const sparePart = await this.sparePartRepository.save({
        ...isExist,
        imageUrl: fileUpload.key,
      });
      return {
        message: 'Spare part updated successfully',
        data: sparePart,
      };
    } catch (error) {
      throw error;
    }
  }

  async findOne(id: string): Promise<CreateSparePartResponseDto> {
    try {
      const projectSparePart = await this.projectSparePartRepository
        .createQueryBuilder('psp')
        .leftJoinAndSelect('psp.project', 'project')
        .leftJoinAndSelect('psp.preferredSupplier', 'preferredSupplier')
        .leftJoinAndSelect(
          'psp.projectSparePartCategory',
          'projectSparePartCategory',
        )
        .leftJoinAndSelect(
          'psp.manageOrders',
          'manageOrders',
          'manageOrders.completedAt IS NULL',
        )
        .leftJoinAndSelect('psp.sparePart', 'sparePart')
        .leftJoinAndSelect(
          'projectSparePartCategory.sparePartCategory',
          'sparePartCategory',
        )
        .leftJoinAndSelect('psp.manageOrdersView', 'manageOrdersView')
        .where('psp.id =:id', { id })
        .getOne();

      if (!projectSparePart) {
        throw new NotFoundException('Spare parts does not exist');
      }

      return {
        message: 'Get spare part successfully',
        data: projectSparePart,
      };
    } catch (error) {
      throw error;
    }
  }

  async remove(id: string): Promise<BaseResponseDto> {
    try {
      const isExist = await this.projectSparePartRepository.findOneBy({
        id,
      });

      if (!isExist) {
        throw new NotFoundException('Spare parts does not exist');
      }

      // await this.manageOrdersService.deleteByProjectSparePart(isExist);
      // await this.projectSparePartRepository.softDelete({ id });

      await this.projectSparePartRepository.save({
        id: isExist.id,
        deletedAt: dateToUTC(),
      });

      return {
        message: 'Spare part deleted successfully',
      };
    } catch (error) {
      throw error;
    }
  }

  async createManyWithCSV(
    user: User,
    createManySparePartsDto: CreateManySparePartsDto,
    file: Express.Multer.File,
  ): Promise<BaseResponseDto> {
    try {
      const sparePartCSV = CSVToJSON<any>(file.buffer.toString());

      const project = await this.projectsService.findOneById(
        createManySparePartsDto.projectId,
      );

      const sparePartMap = [];

      for (let index = 0; index < sparePartCSV.length; index++) {
        const sp = sparePartCSV[index];
        if (sp.partnumber) {
          const preferredSupplier =
            await this.organizationsService.findOneByNameOrCreate(
              sp.suppliername,
            );
          sparePartMap.push({
            ...sp,
            projectId: createManySparePartsDto.projectId,
            preferredSupplierId: preferredSupplier?.id,
            partNumber: sp.partnumber,
            firmwareVersion: sp.firmwareversion,
            preferredSupplierName: sp.suppliername,
            price:
              sp?.price && (sp?.price === 'N/A' || sp?.price === '')
                ? 0
                : isNaN(Number((sp?.price ?? '0').replace(/[^0-9.]/g, '')))
                ? 0
                : Number((sp?.price ?? '0').replace(/[^0-9.]/g, '')),
            remainingQuantity:
              sp?.remainingquantity && sp.remainingquantity === ''
                ? null
                : isNaN(Number(sp.remainingquantity))
                ? 0
                : Number(sp.remainingquantity),
            minimumQuantity:
              sp?.minimumquantity && sp.minimumquantity === ''
                ? null
                : isNaN(Number(sp.minimumquantity))
                ? 1
                : Number(sp.minimumquantity),
          });
        }
      }

      for (let i = 0; i < sparePartMap.length; i++) {
        const sparePart = sparePartMap[i];
        await this.create(user, sparePart);
      }
      return {
        message: 'Spare parts created successfully',
      };
    } catch (error) {
      throw error;
    }
  }

  async updateQuantity(
    id: string,
    quantity: number,
  ): Promise<CreateSparePartResponseDto> {
    try {
      const isExist = await this.projectSparePartRepository.findOneBy({
        id,
      });
      if (!isExist) {
        throw new NotFoundException('Spare parts does not exist');
      }

      const projectSparePart = await this.projectSparePartRepository.save(
        new ProjectSparePart({
          ...isExist,
          remainingQuantity: quantity + isExist.remainingQuantity,
        }),
      );
      return {
        message: 'Spare part updated successfully',
        data: projectSparePart,
      };
    } catch (error) {
      throw error;
    }
  }

  async updateQuantityAndPrice(
    id: string,
    quantity: number,
    price: number | null,
  ): Promise<CreateSparePartResponseDto> {
    try {
      const isExist = await this.projectSparePartRepository.findOneBy({
        id,
      });
      if (!isExist) {
        throw new NotFoundException('Spare parts does not exist');
      }

      const projectSparePart = await this.projectSparePartRepository.save(
        new ProjectSparePart({
          ...isExist,
          price,
          remainingQuantity: quantity,
        }),
      );
      return {
        message: 'Spare part updated successfully',
        data: projectSparePart,
      };
    } catch (error) {
      throw error;
    }
  }

  async findById(id: string): Promise<ProjectSparePart> {
    return this.projectSparePartRepository.findById(id);
  }

  async deleteSparePart(
    deleteSparePartDto: DeleteSparePartDto,
  ): Promise<BaseResponseDto> {
    try {
      await this.projectSparePartRepository.softDelete({
        id: In(deleteSparePartDto.ids),
      });
      return {
        message: 'Spare parts deleted successfully',
      };
    } catch (error) {
      throw error;
    }
  }

  async getSparePartStats(
    projectId: string,
    token: string,
    user: User,
    dateRange?: {
      startDate?: string;
      endDate?: string;
    },
  ): Promise<SparePartDashboardStatsResponseDto> {
    let startDate = moment().utc().startOf('year').format('YYYY-MM-DD');
    let endDate = moment().utc().endOf('year').format('YYYY-MM-DD');
    const year = moment.utc(startDate).year();

    if (dateRange?.startDate && dateRange?.endDate) {
      if (
        moment.utc(dateRange.startDate).isAfter(moment.utc(dateRange.endDate))
      ) {
        throw new BadRequestException(
          'startDate must be before or equal to endDate',
        );
      }

      startDate = moment.utc(dateRange.startDate).format('YYYY-MM-DD');
      endDate = moment.utc(dateRange.endDate).format('YYYY-MM-DD');
    }

    let projectIds = [projectId];

    if (!projectId) {
      const data = await this.projectsService.findMasterProjectsByUserId(
        user.id,
      );
      projectIds = data.map(({ project }) => project.id);
      if (!projectIds.length) {
        return {
          data: {
            totalCost: 0,
            currentYearCost: 0,
            totalCount: 0,
            outOfStockCount: 0,
            lowInventoryCount: 0,
            drawTotal: 0,
            restockTotal: 0,
            year: year,
          },
          message: 'Get spare parts dashboard stats successfully.',
        };
      }
    }
    const [
      inventoryCounts,
      totalCost,
      currentYearCost,
      currentYearBorrowAndRestockCost,
    ] = await Promise.all([
      this.getInventoryCounts(projectIds, { startDate, endDate }),
      this.getCurrentYearOrTotalCost(projectIds),
      this.getCurrentYearOrTotalCost(projectIds, { startDate, endDate }),
      this.getCurrentYearBorrowAndRestockCost(projectIds, {
        startDate,
        endDate,
      }),
    ]);

    return {
      data: {
        year,
        totalCost,
        currentYearCost,
        ...inventoryCounts,
        ...currentYearBorrowAndRestockCost,
        // result,
      },
      message: 'Get spare parts dashboard stats successfully.',
    };
  }

  async getCurrentYearOrTotalCost(
    projectIds: string[],
    dateRange?: { startDate: string; endDate: string },
  ) {
    // const qtyQuery = this.projectSparePartRepository
    //   .createQueryBuilder('psp')
    //   .leftJoinAndSelect('psp.project', 'project')
    //   .where('project.id IN (:...projectIds)', {
    //     projectIds,
    //   })
    //   .leftJoin('psp.manageOrderHistories', 'manageOrderHistories')
    //   .andWhere('manageOrderHistories.quantityType = :type', {
    //     type: QuantityTypes.BORROW,
    //   })
    //   .select('SUM(manageOrderHistories.quantity)', 'totalBorrowedQuantity');

    const totalPriceQuery = this.projectSparePartRepository
      .createQueryBuilder('psp')
      .leftJoinAndSelect('psp.project', 'project')
      .where('project.id IN (:...projectIds)', { projectIds })
      .leftJoin('psp.manageOrderHistories', 'manageOrderHistories')
      .select(
        'SUM(psp.remainingQuantity * COALESCE(psp.price, 0))',
        'totalPrice',
      );

    if (dateRange?.startDate && dateRange?.endDate) {
      const { startDate, endDate } = dateRange;
      // qtyQuery.andWhere('manageOrderHistories.createdAt >= :startYear', {
      //   startYear: dateToUTC(yearStart),
      // });
      totalPriceQuery.andWhere(
        'DATE(psp.createdAt) BETWEEN :startDate AND :endDate',
        { startDate, endDate },
      );
    }

    // const { totalBorrowedQuantity } = await qtyQuery.getRawOne();
    const { totalPrice } = await totalPriceQuery.getRawOne();

    const totalCost = totalPrice;
    return totalCost;
  }

  async getInventoryCounts(
    projectIds: string[],
    dateRange: { startDate: string; endDate: string },
  ) {
    const { startDate, endDate } = dateRange;
    const inventoryCounts = await this.projectSparePartRepository
      .createQueryBuilder('psp')
      .leftJoinAndSelect('psp.project', 'project')
      .where('project.id IN (:...projectIds)', { projectIds })
      .andWhere('DATE(psp.createdAt) BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      })
      .select([
        'COUNT(psp.id) AS totalCount',
        'SUM(CASE WHEN psp.remainingQuantity <= psp.minimumQuantity AND psp.remainingQuantity != 0 THEN 1 ELSE 0 END) AS lowInventoryCount',
        'SUM(CASE WHEN psp.remainingQuantity <= 0 THEN 1 ELSE 0 END) AS outOfStockCount',
      ])
      .getRawOne();

    return {
      totalCount: parseInt(inventoryCounts?.totalcount || 0),
      outOfStockCount: parseInt(inventoryCounts?.outofstockcount || 0),
      lowInventoryCount: parseInt(inventoryCounts?.lowinventorycount || 0),
    };
  }

  private async getCurrentYearBorrowAndRestockCost(
    projectIds: string[],
    dateRange: { startDate: string; endDate: string },
  ): Promise<SparePartsTotalCost> {
    const { startDate, endDate } = dateRange;
    const query = this.projectSparePartRepository
      .createQueryBuilder('psp')
      .leftJoin('psp.project', 'project')
      .where('project.id IN (:...projectIds)', { projectIds })
      .leftJoin('psp.manageOrderHistories', 'manageOrderHistories')
      .andWhere(
        'DATE(manageOrderHistories.createdAt) BETWEEN :startDate AND :endDate',
        { startDate, endDate },
      )
      .groupBy('psp.id')
      .addSelect(
        'SUM(CASE WHEN manageOrderHistories.quantityType = :borrow THEN manageOrderHistories.quantity ELSE 0 END * COALESCE(manageOrderHistories.price, 0))',
        'drawTotal',
      )
      .addSelect(
        'SUM(CASE WHEN manageOrderHistories.quantityType = :restock THEN manageOrderHistories.quantity ELSE 0 END * COALESCE(manageOrderHistories.price, 0))',
        'restockTotal',
      )
      .setParameter('borrow', QuantityTypes.BORROW)
      .setParameter('restock', QuantityTypes.RESTOCK);

    const result = await query.getRawMany();
    return {
      drawTotal: this.calculateTotal(result, 'drawTotal'),
      restockTotal: this.calculateTotal(result, 'restockTotal'),
    };
  }

  async getMonthlyHistoryCounts(
    projectId: string,
    token: string,
    user: User,
  ): Promise<SparePartDashboardMonthlyHistoryResponseDto> {
    const year = new Date().getFullYear();
    const monthlyCounts: any = [];

    let projectIds = [projectId];

    if (!projectId) {
      const data = await this.projectsService.findMasterProjectsByUserId(
        user.id,
      );
      projectIds = data.map(({ project }) => project.id);
    }

    for (let month = 1; month <= 12; month++) {
      const startDate = moment()
        .year(year)
        .month(month - 1)
        .startOf('month')
        .format('YYYY-MM-DD');
      const endDate = moment()
        .year(year)
        .month(month - 1)
        .endOf('month')
        .format('YYYY-MM-DD');
      const monthName = moment()
        .month(month - 1)
        .format('MMM, 24');

      const result = await this.projectSparePartRepository
        .createQueryBuilder('psp')
        .leftJoinAndSelect('psp.project', 'project')
        .where('project.id IN (:...projectIds)', { projectIds })
        .leftJoin('psp.manageOrderHistories', 'manageOrderHistories')
        .andWhere(
          'DATE(manageOrderHistories.createdAt) BETWEEN :startDate AND :endDate',
          { startDate, endDate },
        )
        .select([
          'SUM(CASE WHEN manageOrderHistories.quantityType = :refill THEN manageOrderHistories.quantity ELSE 0 END) AS refillCount',
          'SUM(CASE WHEN manageOrderHistories.quantityType = :draw THEN manageOrderHistories.quantity ELSE 0 END) AS drawCount',
        ])
        .setParameter('refill', 'RESTOCK')
        .setParameter('draw', 'BORROW')
        .getRawOne(); // RESTOCK = REFILL, BORROW = DRAW

      monthlyCounts.push({
        year,
        month: monthName,
        refillCount: parseInt(result.refillcount),
        drawCount: parseInt(result.drawcount),
      });
    }

    return {
      data: monthlyCounts,
      message: 'Get spare part dashboard monthly history counts.',
    };
  }

  async getCurrentYearMonthlyTotalPrice(
    projectId: string,
    token: string,
    user: User,
  ): Promise<SparePartsMonthlyCostResponse> {
    const monthlyTotals: MonthlyTotalPrice[] = [];
    let projectIds = [projectId];
    const year = moment().year();

    if (!projectId) {
      const data = await this.projectsService.findMasterProjectsByUserId(
        user.id,
      );
      projectIds = data.map(({ project }) => project.id);

      if (!projectIds.length) {
        return { data: monthlyTotals };
      }
    }

    for (let month = 1; month <= 12; month++) {
      const startDate = moment()
        .year(year)
        .month(month - 1)
        .startOf('month')
        .format('YYYY-MM-DD');
      const endDate = moment()
        .year(year)
        .month(month - 1)
        .endOf('month')
        .format('YYYY-MM-DD');
      const monthName = moment()
        .month(month - 1)
        .format('MMM, YY');

      const query = this.projectSparePartRepository
        .createQueryBuilder('psp')
        .leftJoin('psp.project', 'project')
        .where('project.id IN (:...projectIds)', { projectIds })
        .leftJoin('psp.manageOrderHistories', 'manageOrderHistories')
        .andWhere(
          'DATE(manageOrderHistories.createdAt) BETWEEN :startDate AND :endDate',
          { startDate, endDate },
        )
        .groupBy('psp.id')
        .addSelect(
          'SUM(CASE WHEN manageOrderHistories.quantityType = :borrow THEN manageOrderHistories.quantity ELSE 0 END * COALESCE(manageOrderHistories.price, 0))',
          'drawTotal',
        )
        .addSelect(
          'SUM(CASE WHEN manageOrderHistories.quantityType = :restock THEN manageOrderHistories.quantity ELSE 0 END * COALESCE(manageOrderHistories.price, 0))',
          'restockTotal',
        )
        .setParameter('borrow', QuantityTypes.BORROW)
        .setParameter('restock', QuantityTypes.RESTOCK);

      const result = await query.getRawMany();
      monthlyTotals.push({
        month: monthName,
        drawTotal: this.calculateTotal(result, 'drawTotal'),
        restockTotal: this.calculateTotal(result, 'restockTotal'),
      });
    }

    return { data: monthlyTotals };
  }

  // Helper function to calculate total
  private calculateTotal(records: any[], key: string): number {
    return records?.reduce(
      (sum, record) =>
        sum + (record[key] !== undefined ? Number(record[key]) : 0),
      0,
    );
  }

  async getAllSpareParts(
    projectId: string,
    token: string,
    user: User,
  ): Promise<ProjectSparePart[]> {
    let projectIds = [projectId];

    if (!projectId) {
      const data = await this.projectsService.findMasterProjectsByUserId(
        user.id,
      );
      projectIds = data.map(({ project }) => project.id);
    }
    const spareParts = await this.projectSparePartRepository
      .createQueryBuilder('psp')
      .leftJoinAndSelect('psp.project', 'project')
      .where('project.id IN (:...projectIds)', {
        projectIds,
      })
      .leftJoinAndSelect('psp.preferredSupplier', 'preferredSupplier')
      .leftJoinAndSelect(
        'psp.projectSparePartCategory',
        'projectSparePartCategory',
      )
      .leftJoinAndSelect('psp.sparePart', 'sparePart')
      .leftJoinAndSelect(
        'projectSparePartCategory.sparePartCategory',
        'sparePartCategory',
      )
      .leftJoinAndSelect('psp.manageOrdersView', 'manageOrdersView')
      .getMany();

    return spareParts;
  }

  async downloadProjectSparePartsAsCsv(
    res: Response,
    projectId: string,
    token: string,
    user: User,
  ) {
    const spareParts = await this.getAllSpareParts(projectId, token, user);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="alectify_spare_parts.csv"',
    );

    const csvStringifier = createObjectCsvStringifier({
      header: [
        { id: 'serialNumber', title: '#' },
        { id: 'status', title: 'Status' },
        { id: 'site', title: 'Site' },
        { id: 'projectSparePartCategory', title: 'Category' },
        { id: 'sparePart', title: 'Part Number' },
        { id: 'description', title: 'Description' },
        { id: 'vendor', title: 'Vendor' },
        { id: 'remainingQuantity', title: 'In-hand Qty' },
        { id: 'minimumQuantity', title: 'Min Qty' },
        { id: 'system', title: 'System' },
        { id: 'room', title: 'Room' },
        { id: 'rack', title: 'Rack' },
        { id: 'shelf', title: 'Shelf' },
        { id: 'firmwareVersion', title: 'Firmware Version' },
        { id: 'price', title: 'Price' },
        { id: 'comments', title: 'Comments' },
      ],
    });

    res.write(csvStringifier.getHeaderString());

    for (const [index, part] of spareParts.entries()) {
      let status = 'Normal';
      if (part.remainingQuantity <= part.minimumQuantity) {
        status = 'Low Inventory';
      }
      if (part.remainingQuantity <= 0) {
        status = 'Out of Stock';
      }

      const csvRecord = {
        serialNumber: index + 1,
        status,
        site: part.project.name,
        system: part.system,
        room: part.room,
        rack: part.rack,
        vendor: part.preferredSupplier.name,
        description: cleanHtmlTags(part.sparePart.description || ''),
        shelf: part.shelf,
        firmwareVersion: part.firmwareVersion,
        minimumQuantity: part.minimumQuantity,
        remainingQuantity: part.remainingQuantity,
        price: part.price,
        comments: cleanHtmlTags(part.comments || ''),
        sparePart: part.sparePart.partNumber,
        projectSparePartCategory: part.projectSparePartCategory
          ? part.projectSparePartCategory?.sparePartCategory?.category
          : '', // Access related object's property
      };
      res.write(csvStringifier.stringifyRecords([csvRecord]));
    }

    return res.end();
  }

  async sendSparePartsNotificationsQueue(
    projectSparePart: ProjectSparePart,
    project: Project,
    user: User,
    messageText: string,
  ) {
    return await this.sparePartQueue.add('sendSparePartsNotifications', {
      projectSparePart,
      project,
      user,
      messageText,
    });
  }

  async sendSparePartsEmailQueue(project: Project, subject, emailBody) {
    return await this.sparePartQueue.add('sendSparePartsEmail', {
      project,
      subject,
      emailBody,
    });
  }

  async sendSparePartsEmail(project: Project, subject, emailBody) {
    const projectUsers =
      await this.projectsService.findAllUsersByMasterProjectId(project.id);
    const emails = projectUsers
      ?.filter(
        (record) =>
          record.user.email_preferences &&
          record.user.email_spare_part_preferences &&
          (record.user.user_type === UserTypes.ADMIN ||
            record.user.user_type === UserTypes.INTERNAL),
      )
      ?.map((record) => record.user.email);

    const emailPayload: SendMailDto = {
      to: emails,
      subject: subject,
      text: DefaultEmailTemplate.get(emailBody),
    };
    this.sendGridService.sendMail(emailPayload, true);
  }

  async sendSparePartsNotifications(
    projectSparePart: ProjectSparePart,
    project: Project,
    user: User,
    messageText: string,
  ) {
    try {
      const projectUsers =
        await this.projectsService.findAllUsersByMasterProjectId(project.id);
      const projectAdminAndInternalUsers = projectUsers
        ?.filter(
          (record) =>
            record.user.user_type === UserTypes.ADMIN ||
            record.user.user_type === UserTypes.INTERNAL,
        )
        ?.map((record) => record.user);
      const projectAdminAndInternalUserIds = projectAdminAndInternalUsers?.map(
        (record) => record.id,
      );

      let deviceIds = [];
      if (projectAdminAndInternalUserIds?.length > 0) {
        deviceIds = await this.userFcmTokenService.findFcmTokensByUserIds(
          projectAdminAndInternalUserIds,
        );
      }
      if (!deviceIds?.length) return;

      const requestUser = `${user.first_name} ${user.last_name}`;
      const message = `${requestUser} ${messageText}`;

      const notification = {
        workId: projectSparePart.id, // this is projectSparePart Id
        workTitle: projectSparePart.system, // this is projectSparePart system (title)
        type: NotificationTypes.SPARE_PART,
        userId: user.id,
      };

      await Promise.all([
        this.notificationService.createSparePartsNotification(
          projectSparePart,
          project,
          messageText,
          user.id,
          true, // by defualt this is system generated notifications
          projectAdminAndInternalUsers,
        ),
        this.notificationService.sendNotificationToMultipleDevices(
          // sending push notifications to the devices
          deviceIds,
          message,
          notification,
        ),
      ]);
    } catch (error) {
      console.log('error');
    }
  }

  buildSparePartEmailBody(
    part: ProjectSparePart,
    categoryWrapper: any,
    supplier: any,
  ): string {
    const lines: string[] = [
      `<h3 style="color: #0954f1">Spare Part Details</h3>`,
      `<span><strong>Part Number:</strong> ${part.sparePart.partNumber}</span>`,
    ];

    if (categoryWrapper?.sparePartCategory?.category) {
      lines.push(
        `<span><strong>Category:</strong> ${categoryWrapper.sparePartCategory.category}</span>`,
      );
    }

    const optionalFields: Record<string, any> = {
      System: part.system,
      Vendor: supplier?.name,
      'Firmware Version': part.firmwareVersion,
      Room: part.room,
      Rack: part.rack,
      Shelf: part.shelf,
      'Min Qty': part.minimumQuantity,
      'In-Hand Qty': part.remainingQuantity,
      'Average Unit Price': part.price,
    };

    for (const [label, value] of Object.entries(optionalFields)) {
      if (value) lines.push(`<span><strong>${label}:</strong> ${value}</span>`);
    }

    return lines.join('<br>');
  }
}
