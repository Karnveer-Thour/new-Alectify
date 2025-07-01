import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateIncidentReportDto } from './dto/create-incident-report.dto';
import { UpdateIncidentReportDto } from './dto/update-incident-report.dto';
import { GetAllIncidentReportResponseDto } from './dto/get-all-incident-report.dto';
import { ProjectsService } from '../projects/projects.service';
import { User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { CreateIncidentReportResponseDto } from './dto/create-incident-report-response.dto';
import { IncidentReport } from './entities/incident-report.entity';
import { IncidentReportsRepository } from './repositories/incident-repository';
import {
  dateToUTC,
  displayDateWithTimeZoneWithOutSecond,
  getTimeZone,
  getTimeZoneShortForm,
  toArray,
} from '@common/utils/utils';
import { IncidentReportTeamMembersService } from 'modules/incident-report-team-members/incident-report-team-members.service';

import { IPaginationOptions } from 'nestjs-typeorm-paginate';
import { Brackets } from 'typeorm';
import { FilesUploadService } from 'modules/files-upload/files-upload.service';
import { IncidentReportDocumentRepository } from './repositories/incident-report-document.repository';
import { IncidentReportDocument } from './entities/incident-report-document.entity';
import { StatusUpdateIncidentReportDto } from './dto/status-update-incident-report.dto';
import { IncidentReportStatuses } from './models/status.enum';
import { IncidentReportComment } from 'modules/incident-report-comments/entities/incident-report-comment.entity';
import { IncidentReportCommentsRepository } from 'modules/incident-report-comments/repositories/incident-report-comments.repository';
import { IncidentReportAreasService } from './incident-reports-areas.service';
import { IncidentReportAssetsService } from './incident-reports-assets.services';
import { SendGridService } from '@core/sendgrid/sendgrid.service';
import { SendMailDto } from '@core/sendgrid/dto/sendmail.dto';
import { UserTypes } from 'modules/users/models/user-types.enum';

@Injectable()
export class IncidentReportsService {
  constructor(
    private usersService: UsersService,
    private projectsService: ProjectsService,
    private fileUploadService: FilesUploadService,
    private incidentReportsRepository: IncidentReportsRepository,
    private incidentReportTeamMembersService: IncidentReportTeamMembersService,
    private incidentReportDocumentRepository: IncidentReportDocumentRepository,
    private incidentReportCommentsRepository: IncidentReportCommentsRepository,
    private incidentReportAssetsService: IncidentReportAssetsService,
    private incidentReportAreassService: IncidentReportAreasService,
    private readonly sendGridService: SendGridService,
  ) {}
  async create(
    user: User,
    token: string,
    createIncidentReportDto: CreateIncidentReportDto,
    files: Array<Express.Multer.File>,
  ): Promise<CreateIncidentReportResponseDto> {
    try {
      const [authUser, project, subProject] = await Promise.all([
        this.usersService.findOneById(user.id),
        this.projectsService.findOneById(createIncidentReportDto.projectId),
        this.projectsService.findOneByIdSubProject(
          createIncidentReportDto.subProjectId,
        ),
      ]);

      let team;

      if (createIncidentReportDto.teamId) {
        team = await this.projectsService.findOneByIdTeam(
          createIncidentReportDto.teamId,
        );
      }
      const affectedSystem = createIncidentReportDto.affectedSystemId
        ? await this.projectsService.findAffectedSystemById(
            createIncidentReportDto.affectedSystemId,
          )
        : null;

      const impact = createIncidentReportDto.impactId
        ? await this.projectsService.findImpactById(
            createIncidentReportDto.impactId,
          )
        : null;

      const irCreate = new IncidentReport({
        incidentId: await this.getWorkId(createIncidentReportDto.projectId),
        team,
        project,
        subProject,
        affectedSystem,
        impact,
        createdBy: user,
        title: createIncidentReportDto.title,
        isDraft:
          createIncidentReportDto?.isDraft === 'true'
            ? true
            : createIncidentReportDto?.isDraft === 'false'
            ? false
            : null,
        priority: createIncidentReportDto.priority,
        description: createIncidentReportDto.description,
        incidentDate: dateToUTC(createIncidentReportDto.incidentDate),
        emailToClient:
          createIncidentReportDto.emailToClient === 'true'
            ? true
            : createIncidentReportDto.emailToClient === 'false'
            ? false
            : null,
        type: createIncidentReportDto.type,
        incidentNo: createIncidentReportDto?.incidentNo,
      });

      const incidentReport = await this.incidentReportsRepository.save(
        irCreate,
      );

      // Handle team members
      let teamMemberUsers = [];
      if (createIncidentReportDto.teamMembers?.length) {
        teamMemberUsers = await this.usersService.findUsersByIds(
          createIncidentReportDto.teamMembers,
        );
      }

      if (teamMemberUsers.length) {
        const teamMembers = teamMemberUsers.map((user) => ({
          user,
          incidentReport,
          createdAt: dateToUTC(),
          updatedAt: dateToUTC(),
        }));
        await this.incidentReportTeamMembersService.insertMany(teamMembers);
      }

      await Promise.all([
        createIncidentReportDto?.assetIds?.length
          ? this.incidentReportAssetsService.setAssetsForIncidentReport(
              incidentReport.id,
              createIncidentReportDto.assetIds,
              true,
            )
          : { message: 'No assets to update', data: { asset: [] } },

        createIncidentReportDto?.areaIds?.length
          ? this.incidentReportAreassService.setAreasForIncidentReport(
              incidentReport.id,
              createIncidentReportDto.areaIds,
              true,
            )
          : { message: 'No areas to update', data: { area: [] } },
      ]);

      const incidentReports =
        await this.incidentReportsRepository.findOneWithAssetsAreas(
          incidentReport.id,
        );

      // Generate incident summary HTML
      const impactedAssetsAndAreas =
        [
          ...(incidentReports?.assets?.map(({ asset }) => asset.name) || []),
          ...(incidentReports?.areas?.map(({ area }) => area.name) || []),
        ].join(', ') || 'None';

      let projectTimezone = null;
      let projectTimezoneShortForm = null;
      if (project.latitude && project.longitude) {
        projectTimezone = getTimeZone(project.latitude, project.longitude);
        projectTimezoneShortForm = getTimeZoneShortForm(projectTimezone);
      }
      let incidentSummaryHtmlEmail = ` <h3 style="color: #0954f1">Incident Summary</h3>
      <span><strong>Incident Title: </strong> ${createIncidentReportDto.title}</span><br>`;
      let incidentSummaryHtml = `
      <span><strong>Incident Title: </strong> ${createIncidentReportDto.title}</span><br>`;

      if (incidentReport.incidentNo || createIncidentReportDto.incidentDate) {
        incidentSummaryHtml += `<span>`;
        incidentSummaryHtmlEmail += `<span>`;
        if (incidentReport.incidentNo) {
          incidentSummaryHtml += `<strong>Incident #: </strong> ${incidentReport.incidentNo} `;
          incidentSummaryHtmlEmail += `<strong>Incident #: </strong> ${incidentReport.incidentNo} `;
        }
        if (createIncidentReportDto.incidentDate) {
          incidentSummaryHtml += `<strong>Incident Date/Time: </strong> ${displayDateWithTimeZoneWithOutSecond(
            createIncidentReportDto.incidentDate,
            false,
            projectTimezone,
          )} ${
            projectTimezoneShortForm ? `(${projectTimezoneShortForm})` : ''
          }`;

          incidentSummaryHtmlEmail += `<strong>Incident Date/Time: </strong> ${displayDateWithTimeZoneWithOutSecond(
            createIncidentReportDto.incidentDate,
            false,
            projectTimezone,
          )} ${
            projectTimezoneShortForm ? `(${projectTimezoneShortForm})` : ''
          }`;
        }
        incidentSummaryHtml += `</span><br>`;
        incidentSummaryHtmlEmail += `</span><br>`;
      }

      incidentSummaryHtml += `<span><strong>Incident Type: </strong> ${createIncidentReportDto.type}</span><br>`;
      incidentSummaryHtmlEmail += `<span><strong>Incident Type: </strong> ${createIncidentReportDto.type}</span><br>`;
      if (impact?.name) {
        incidentSummaryHtml += `<span><strong>Incident Impact: </strong> ${impact?.name}</span><br>`;
        incidentSummaryHtmlEmail += `<span><strong>Incident Impact: </strong> ${impact?.name}</span><br>`;
      }
      if (affectedSystem?.name) {
        incidentSummaryHtml += `<span><strong>Affected Systems: </strong> ${affectedSystem?.name}</span><br>`;
        incidentSummaryHtmlEmail += `<span><strong>Affected Systems: </strong> ${affectedSystem?.name}</span><br>`;
      }
      incidentSummaryHtml += `<span><strong>Impacted Assets: </strong> ${impactedAssetsAndAreas}</span><br>`;
      incidentSummaryHtmlEmail += `<span><strong>Impacted Assets: </strong> ${impactedAssetsAndAreas}</span><br>`;

      if (createIncidentReportDto.priority) {
        incidentSummaryHtml += `<span><strong>Priority: </strong> ${createIncidentReportDto.priority}</span><br>`;
        incidentSummaryHtmlEmail += `<span><strong>Priority: </strong> ${createIncidentReportDto.priority}</span><br>`;
      }
      incidentSummaryHtmlEmail += `<span><strong>Created by/at: </strong> ${
        user.first_name
      } ${user.last_name} created at ${displayDateWithTimeZoneWithOutSecond(
        incidentReport.createdAt,
        false,
        projectTimezone,
      )} ${
        projectTimezoneShortForm ? `(${projectTimezoneShortForm})` : ''
      }</span><br>`;

      const incidentReportComment = new IncidentReportComment({
        description: createIncidentReportDto.description,
        actions: createIncidentReportDto.actions,
        systemState: createIncidentReportDto.systemState,
        callAt: createIncidentReportDto.callAt
          ? dateToUTC(createIncidentReportDto.callAt)
          : null,
        nextUpdateAt: createIncidentReportDto.nextUpdateAt
          ? dateToUTC(createIncidentReportDto.nextUpdateAt)
          : null,
        incidentReport,
        incidentSummary: incidentSummaryHtml,
        isSystemGenerated: true,
        createdBy: user,
      });

      await this.incidentReportCommentsRepository.save(incidentReportComment);
      let emailAttachments = [];

      if (files?.length) {
        const uploadedFiles = await this.fileUploadService.multiFileUpload(
          files,
          'incident-reports',
          true,
          token,
          authUser.branch.company.id,
        );
        emailAttachments = uploadedFiles.map((file) => ({
          filename: file.originalname,
          content: file.buffer,
          type: file.mimetype,
          disposition: 'attachment',
        }));

        const documentsToCreate = uploadedFiles.map((uploadedFile) => ({
          incidentReport: incidentReport.id as any,
          uploadedBy: user,
          fileName: uploadedFile.originalname,
          filePath: uploadedFile.key,
          fileType: uploadedFile.mimetype,
          updatedAt: dateToUTC(),
          createdAt: dateToUTC(),
        }));
        await this.incidentReportDocumentRepository.insert(documentsToCreate);
      }

      if (createIncidentReportDto.emailToClient) {
        const createdByEmail = user.email;
        const teamMemberEmails = teamMemberUsers?.length
          ? teamMemberUsers.map((member) => member.email)
          : [];
        const teamEmails = team
          ? team.projectTeamMembers?.map(({ user }) => user.email)
          : [];

        const uniqueEmails = Array.from(
          new Set([createdByEmail, ...teamMemberEmails, ...teamEmails]),
        );

        const emailPayload: SendMailDto = {
          to: uniqueEmails,
          subject: `${incidentReport.title} (Ticket #: ${incidentReport.id})`,
          text: `
        ${incidentSummaryHtmlEmail}
        <h3 style="color: #0954f1">Incident Description</h3>
        <span>${createIncidentReportDto.description ?? '-'}</span>
        <h3 style="color: #0954f1">Next Update:</h3> 
       <span>${
         createIncidentReportDto.nextUpdateAt
           ? `${displayDateWithTimeZoneWithOutSecond(
               createIncidentReportDto.nextUpdateAt,
               false,
               projectTimezone,
             )} ${
               projectTimezoneShortForm ? `(${projectTimezoneShortForm})` : ''
             }`
           : '-'
       }</span>
        <h3 style="color: #0954f1">System State</h3>
        <span>${createIncidentReportDto.systemState ?? '-'}</span>
        <h3 style="color: #0954f1">Actions</h3>
        <span>${createIncidentReportDto.actions ?? '-'}</span>
        ---------------------------------------------------------------------------------------
        <p>This is an Automated email. You can Reply to this email and it will be automatically entered into the system.</p>
      `,
          attachments: emailAttachments,
        };
        await this.sendGridService.sendMailTest(emailPayload, true);
      }

      return {
        message: 'Incident Report created successfully',
        data: incidentReport,
      };
    } catch (error) {
      throw error;
    }
  }

  async findAll(
    user: User,
    projectId: string,
    teamMembers: string | string[],
    createdById: string,
    search: string,
    status: IncidentReportStatuses,
    orderField: string,
    orderBy: 'ASC' | 'DESC',
    options: IPaginationOptions,
    isActive?: boolean,
  ): Promise<GetAllIncidentReportResponseDto> {
    try {
      const isAdmin = user.user_type === UserTypes.ADMIN;
      const limit = parseInt(options.limit as string);
      const page = parseInt(options.page as string);
      teamMembers = toArray(teamMembers);

      const incidentReports = this.incidentReportsRepository
        .createQueryBuilder('ir')
        .leftJoinAndSelect('ir.project', 'project')
        .leftJoinAndSelect('ir.createdBy', 'createdBy')
        .leftJoinAndSelect('ir.teamMembers', 'teamMembers')
        .leftJoinAndSelect('teamMembers.user', 'user')
        .leftJoinAndSelect('ir.team', 'team')
        .leftJoinAndSelect('team.projectTeamMembers', 'projectTeamMembers')
        .leftJoinAndSelect('projectTeamMembers.user', 'projectTeamMembersUser')
        .leftJoinAndSelect(
          'ir.documents',
          'documents',
          `documents.isActive = true`,
        );
      const activeFilter = typeof isActive === 'boolean' ? isActive : true;

      incidentReports.andWhere('ir.isActive = :isActive', {
        isActive: activeFilter,
      });

      if (projectId) {
        incidentReports.andWhere('project.id =:projectId', {
          projectId,
        });
      }
      if (search) {
        incidentReports.andWhere(
          new Brackets((qb) => {
            qb.where('project.name ILIKE :search', {
              search: `%${search}%`,
            })
              .orWhere('ir.title ILIKE :search', {
                search: `%${search}%`,
              })
              .orWhere('ir.incidentId ILIKE :search', {
                search: `%${search}%`,
              });
          }),
        );
      }
      if (!isAdmin) {
        if (teamMembers.length || createdById) {
          incidentReports.andWhere(
            new Brackets((qb) => {
              if (teamMembers.length) {
                qb.orWhere('projectTeamMembersUser.id IN (:...teamMembers)', {
                  teamMembers,
                }).orWhere('user.id IN (:...teamMembers)', {
                  teamMembers,
                });
              }

              if (createdById) {
                qb.orWhere('createdBy.id = :createdById', { createdById });
              }
            }),
          );
        }
      }
      if (status) {
        incidentReports.andWhere('ir.status = :status', { status });
      }
      if (orderField && orderBy) {
        incidentReports.addOrderBy(`ir.${orderField}`, orderBy);
      } else {
        incidentReports.addOrderBy('ir.createdAt', 'DESC');
      }
      const [data, count] = await incidentReports.take(limit).getManyAndCount();

      return {
        data: data,
        message: 'Get All Incident Reports Successfully',
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

  async findOne(id: string) {
    try {
      const incidentReport =
        await this.incidentReportsRepository.findOneWithTeam(id);
      return {
        message: 'Get incident report successfully',
        data: incidentReport,
      };
    } catch (error) {
      throw error;
    }
  }

  async update(
    user: User,
    token: string,
    id: string,
    dto: UpdateIncidentReportDto,
    files: Array<Express.Multer.File>,
  ): Promise<CreateIncidentReportResponseDto> {
    try {
      const [authUser, existingReport] = await Promise.all([
        this.usersService.findOneById(user.id),
        this.findOneById(id),
      ]);

      if (!existingReport) {
        throw new NotFoundException('Incident Report does not exist');
      }

      const {
        affectedSystemId,
        impactId,
        teamId,
        teamMembers = [],
        ...otherUpdateFields
      } = dto;

      const [team, affectedSystem, impact] = await Promise.all([
        teamId ? this.projectsService.findOneProjectTeamById(teamId) : null,
        affectedSystemId
          ? this.projectsService.findAffectedSystemById(affectedSystemId)
          : existingReport.affectedSystem,
        impactId
          ? this.projectsService.findImpactById(impactId)
          : existingReport.impact,
      ]);

      if (affectedSystemId && !affectedSystem) {
        throw new NotFoundException('Invalid affected system ID');
      }

      if (impactId && !impact) {
        throw new NotFoundException('Invalid impact ID');
      }

      const updatedReport = await this.incidentReportsRepository.save({
        ...existingReport,
        ...otherUpdateFields,
        affectedSystem,
        impact,
        team,
      });

      // Update team members
      await this.incidentReportTeamMembersService.createAndRemove(
        existingReport.id,
        teamMembers.length ? teamMembers : [],
      );

      // Handle file uploads
      if (files?.length) {
        const uploadedFiles = await this.fileUploadService.multiFileUpload(
          files,
          'incident-reports',
          true,
          token,
          authUser.branch.company.id,
        );

        const documents = uploadedFiles.map(
          (file) =>
            new IncidentReportDocument({
              incidentReport: existingReport.id as any,
              uploadedBy: user.id as any,
              fileName: file.originalname,
              filePath: file.key,
              fileType: file.mimetype,
              updatedAt: dateToUTC(),
              createdAt: dateToUTC(),
            }),
        );

        await this.incidentReportDocumentRepository.save(documents);
      }

      return {
        message: 'Incident Report was updated successfully',
        data: updatedReport,
      };
    } catch (error) {
      throw error;
    }
  }

  async softDeleteIncidentReport(id: string) {
    const incidentReport = await this.findOneById(id);
    if (!incidentReport) {
      throw new NotFoundException('Incident Report does not exist');
    }
    incidentReport.isActive = false;
    await this.incidentReportsRepository.save(incidentReport);

    return {
      data: [],
      message: `Incident Report #${id} has been deleted.`,
    };
  }

  async softDeleteDocument(user: User, id: string, deletedComment: string) {
    const isExist = await this.incidentReportDocumentRepository.findOneBy({
      id,
    });
    if (!isExist) {
      throw new NotFoundException('Incident Report Document does not exist');
    }
    console.log('isExistisExist', isExist);
    user = await this.usersService.findOneById(user.id);
    await this.incidentReportDocumentRepository.save(
      new IncidentReportDocument({
        id: isExist.id,
        comment: deletedComment,
        isActive: false,
        softDeletedAt: dateToUTC(),
        deletedBy: user,
      }),
    );

    return {
      data: isExist,
      message: `This action removes a #${id} incidentReport`,
    };
  }

  private async getWorkId(projectId: string) {
    try {
      const project = await this.projectsService.findOneById(projectId);
      const clientCode = `${project.workIdPrefix ?? project.name.length}-IR-`;
      const defaultIncidentId = clientCode + '1';
      const lastRecord = await this.incidentReportsRepository.findLastRecord(
        projectId,
      );

      if (lastRecord) {
        const incidentId = lastRecord?.incidentId;
        if (!incidentId) {
          return defaultIncidentId;
        } else {
          const split = incidentId.split('-');
          const count = split[split.length - 1];
          const parsedCount = Number(count);
          const newCount = isNaN(parsedCount) ? 0 : parsedCount + 1;
          return clientCode + newCount.toString();
        }
      } else {
        return defaultIncidentId;
      }
    } catch (error) {
      throw error;
    }
  }

  async findOneById(id: string): Promise<IncidentReport> {
    try {
      return await this.incidentReportsRepository.findOne({
        where: { id },
        relations: ['project', 'createdBy', 'team'],
      });
    } catch (error) {
      throw error;
    }
  }

  async updateStatus(
    id: string,
    statusUpdateIncidentReportDto: StatusUpdateIncidentReportDto,
  ): Promise<CreateIncidentReportResponseDto> {
    try {
      const isExist = await this.findOneById(id);
      if (!isExist) {
        throw new NotFoundException('Incident Report does not exist');
      }

      const incidentReport = await this.incidentReportsRepository.save({
        ...isExist,
        ...statusUpdateIncidentReportDto,
      });

      return {
        message: 'Incident Report was updated successfully',
        data: incidentReport,
      };
    } catch (error) {
      throw error;
    }
  }
}
