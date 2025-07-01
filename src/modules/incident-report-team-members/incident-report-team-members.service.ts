import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateIncidentReportTeamMemberDto } from './dto/create-incident-report-team-member.dto';
import { UpdateIncidentReportTeamMemberDto } from './dto/update-incident-report-team-member.dto';
import { IncidentReportTeamMembersRepository } from './repositories/incident-report-team-members.repository';
import { IncidentReportTeamMembers } from './entities/incident-report-team-members.entity';
import { User } from '@sentry/node';
import { CreateIncidentReportTeamMemberResponseDto } from './dto/create-incident-report-team-member-response.dto';
import { IncidentReportsService } from 'modules/incident-reports/incident-reports.service';
import { UsersService } from '../users/users.service';
import { BaseResponseDto } from '@common/dto/base-response.dto';
import { In } from 'typeorm';
import { dateToUTC } from '@common/utils/utils';

@Injectable()
export class IncidentReportTeamMembersService {
  constructor(
    private incidentReportTeamMembersRepository: IncidentReportTeamMembersRepository,
    @Inject(forwardRef(() => IncidentReportsService))
    private incidentReportsService: IncidentReportsService,
    private usersService: UsersService,
  ) {}

  async create(
    irId: string,
    createIncidentReportTeamMemberDto: CreateIncidentReportTeamMemberDto,
    requestUser: User,
  ): Promise<CreateIncidentReportTeamMemberResponseDto> {
    try {
      const isExist = await this.incidentReportsService.findOne(irId);
      if (!isExist) {
        throw new NotFoundException('Preventive maintenance does not exist');
      }

      const user = await this.usersService.findOneById(
        createIncidentReportTeamMemberDto.userId,
      );

      const isExistTeamMember = await this.incidentReportTeamMembersRepository
        .createQueryBuilder('tm')
        .where('tm.user = :userId', { userId: user.id })
        .andWhere('tm.incidentReport = :irId', { irId })
        .getOne();

      if (isExistTeamMember) {
        throw new BadRequestException('Team member already exist');
      }

      const teamMember = await this.incidentReportTeamMembersRepository.save(
        new IncidentReportTeamMembers({
          incidentReport: isExist.data,
          user: user,
        }),
      );

      return {
        message: 'Team member added to incident Report',
        data: { teamMember },
      };
    } catch (error) {
      throw error;
    }
  }

  async insertMany(irTeamMembers) {
    try {
      return await this.incidentReportTeamMembersRepository.insert(
        irTeamMembers,
      );
    } catch (error) {
      throw error;
    }
  }

  async createAndRemove(irId: string, userIds: string[]) {
    try {
      const timestamp = dateToUTC();
      const existingIrs = await this.incidentReportTeamMembersRepository
        .createQueryBuilder('iptm')
        .select('iptm.user', 'userId')
        .where('iptm.incidentReport = :irId', { irId })
        .getRawMany();

      const existingUserIds = new Set(existingIrs.map((tm) => tm.userId));
      const incomingUserIds = new Set(userIds);
      const toRemove = [...existingUserIds].filter(
        (id) => !incomingUserIds.has(id),
      );
      const toAdd = [...incomingUserIds].filter(
        (id) => !existingUserIds.has(id),
      );
      if (toRemove.length) {
        this.incidentReportTeamMembersRepository.delete({
          incidentReport: { id: irId },
          user: In(toRemove),
        });
      }
      if (toAdd.length) {
        const insertData = toAdd.map((userId) => ({
          user: userId,
          incidentReport: irId,
          createdAt: timestamp,
          updatedAt: timestamp,
        }));
        await this.insertMany(insertData);
      }
    } catch (error) {
      console.error('Error in createAndRemove (Incident Team Members):', error);
      throw error;
    }
  }

  async deleteByIncidentIds(incidentId: string[]): Promise<BaseResponseDto> {
    try {
      await this.incidentReportTeamMembersRepository.delete({
        incidentReport: In(incidentId),
      });
      return {
        message: 'Team members delete to Incident Report',
      };
    } catch (error) {
      throw error;
    }
  }
}
