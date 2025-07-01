import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PreventiveMaintenancesService } from '../preventive-maintenances/preventive-maintenances.service';
import { User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { CreatePreventiveMaintenanceTeamMemberResponseDto } from './dto/create-preventive-maintenance-team-member-response.dto';
import { CreatePreventiveMaintenanceTeamMemberDto } from './dto/create-preventive-maintenance-team-member.dto';
import { MasterPreventiveMaintenanceTeamMembers } from './entities/master-preventive-maintenance-team-members.entity';
import { PreventiveMaintenanceTeamMembers } from './entities/preventive-maintenance-team-members.entity';
import { MasterPreventiveMaintenanceTeamMembersRepository } from './repositories/master-preventive-maintenance-team-members.repository';
import { PreventiveMaintenanceTeamMembersRepository } from './repositories/preventive-maintenance-team-members.repository';
import { In } from 'typeorm';
import { BaseResponseDto } from '@common/dto/base-response.dto';
import { PreventiveMaintenances } from 'modules/preventive-maintenances/entities/preventive-maintenances.entity';
import { NotificationsService } from 'modules/notifications/notifications.service';
import { UserFcmTokenService } from 'modules/users/services/user-fcm-token.service';
import { dateToUTC, enumToTile } from '@common/utils/utils';
import { CommentsMessages } from 'modules/comments/models/comments-messages';
import { TaskCategories } from 'modules/preventive-maintenances/models/task-categories.enum';
import { MasterPreventiveMaintenances } from 'modules/preventive-maintenances/entities/master-preventive-maintenances.entity';

@Injectable()
export class PreventiveMaintenanceTeamMembersService {
  constructor(
    private pmTeamMembersRepository: PreventiveMaintenanceTeamMembersRepository,
    private masterPmTeamMembersRepository: MasterPreventiveMaintenanceTeamMembersRepository,
    @Inject(forwardRef(() => PreventiveMaintenancesService))
    private pmService: PreventiveMaintenancesService,
    private usersService: UsersService,
    private userFcmTokenService: UserFcmTokenService,
    private notificationService: NotificationsService,
  ) {}

  async findTeamMembersByPMId(pm: PreventiveMaintenances) {
    return await this.pmTeamMembersRepository
      .createQueryBuilder('tm')
      .where('tm.preventiveMaintenance = :pmId', { pmId: pm.id })
      .leftJoinAndSelect('tm.user', 'user')
      .getMany();
  }

  async findTeamMembersByMasterPmId(mpm: MasterPreventiveMaintenances) {
    return await this.masterPmTeamMembersRepository
      .createQueryBuilder('assignee')
      .where('assignee.masterPreventiveMaintenance = :mpmId', { mpmId: mpm.id })
      .leftJoinAndSelect('assignee.user', 'user')
      .getMany();
  }

  async create(
    pmId: string,
    createPMTeamMemberDto: CreatePreventiveMaintenanceTeamMemberDto,
    requestUser?: User,
  ): Promise<CreatePreventiveMaintenanceTeamMemberResponseDto> {
    try {
      const isExist = await this.pmService.findOneByIdWithoutRelations(pmId);
      if (!isExist) {
        throw new NotFoundException('Preventive maintenance does not exist');
      }
      const user = await this.usersService.findOneById(
        createPMTeamMemberDto.userId,
      );
      const isExistTeamMember = await this.pmTeamMembersRepository
        .createQueryBuilder('tm')
        .where('tm.user = :userId', { userId: user.id })
        .andWhere('tm.preventiveMaintenance = :pmId', { pmId })
        .getOne();

      if (isExistTeamMember) {
        throw new BadRequestException('Team member already exist');
      }
      const teamMember = await this.pmTeamMembersRepository.save(
        new PreventiveMaintenanceTeamMembers({
          user: user,
          preventiveMaintenance: isExist,
        }),
      );
      const messageType =
        isExist.taskCategory === TaskCategories.CORRECTIVE_MAINTENANCE ||
        isExist.taskCategory === TaskCategories.PREVENTIVE_MAINTENANCE
          ? isExist.taskCategory
          : 'TASK';
      const messageText = CommentsMessages.TEAM_MEMBER_ADDED.replace(
        '{type}',
        enumToTile(messageType),
      );
      await this.sendTeamMemberUpdateNotification(
        requestUser,
        isExist,
        teamMember.user.id,
        messageText,
      );
      return {
        message: 'Team member added to preventive maintenance',
        data: { teamMember },
      };
    } catch (error) {
      throw error;
    }
  }

  async createForMaster(
    masterPmId: string,
    createPMTeamMemberDto: CreatePreventiveMaintenanceTeamMemberDto,
    requestUser?: User,
  ): Promise<CreatePreventiveMaintenanceTeamMemberResponseDto> {
    try {
      const [isExist, findCurrentPM, findCurrentPMs] = await Promise.all([
        this.pmService.masterFindOneById(masterPmId),
        this.pmService.findOneByMasterPmId(masterPmId),
        this.pmService.findFutureAndCurrentPMs(masterPmId),
      ]);
      if (!isExist) {
        throw new NotFoundException('Preventive maintenance does not exist');
      }
      const user = await this.usersService.findOneById(
        createPMTeamMemberDto.userId,
      );
      const isExistTeamMemberForMaster =
        await this.masterPmTeamMembersRepository
          .createQueryBuilder('tm')
          .where('tm.user = :userId', { userId: user.id })
          .andWhere('tm.masterPreventiveMaintenance = :masterPmId', {
            masterPmId,
          })
          .getOne();
      if (isExistTeamMemberForMaster) {
        throw new BadRequestException('Team member already exist');
      }
      if (findCurrentPMs.length) {
        await Promise.all(
          findCurrentPMs.map(async (pm) => {
            const isExistTeamMember = await this.pmTeamMembersRepository
              .createQueryBuilder('tm')
              .where('tm.user = :userId', { userId: user.id })
              .andWhere('tm.preventiveMaintenance = :pmId', {
                pmId: pm.id,
              })
              .getOne();
            if (!isExistTeamMember) {
              await this.pmTeamMembersRepository.save(
                new PreventiveMaintenanceTeamMembers({
                  user: user,
                  preventiveMaintenance: pm,
                }),
              );
            }
          }),
        );
      }
      const teamMember = await this.masterPmTeamMembersRepository.save(
        new MasterPreventiveMaintenanceTeamMembers({
          user: user,
          masterPreventiveMaintenance: isExist,
        }),
      );
      const messageType =
        isExist.taskCategory === TaskCategories.CORRECTIVE_MAINTENANCE ||
        isExist.taskCategory === TaskCategories.PREVENTIVE_MAINTENANCE
          ? isExist.taskCategory
          : 'TASK';
      const messageText = CommentsMessages.TEAM_MEMBER_ADDED.replace(
        '{type}',
        enumToTile(messageType),
      );
      await this.sendTeamMemberUpdateNotification(
        requestUser,
        findCurrentPM,
        teamMember.user.id,
        messageText,
      );
      return {
        message: 'Team member added to master preventive maintenance',
        data: { teamMember },
      };
    } catch (error) {
      throw error;
    }
  }

  async remove(
    pmId: string,
    userId: string,
    requestUser?: User,
  ): Promise<CreatePreventiveMaintenanceTeamMemberResponseDto> {
    try {
      const isExist = await this.pmTeamMembersRepository.findOneBy({
        user: { id: userId },
        preventiveMaintenance: { id: pmId },
      });
      if (!isExist) {
        throw new NotFoundException(
          'Preventive maintenance team member does not exist',
        );
      }
      const pmDetails = await this.pmService.findOneByIdWithoutRelations(pmId);
      const teamMember = await this.pmTeamMembersRepository.remove(isExist);
      const messageType =
        pmDetails.taskCategory === TaskCategories.CORRECTIVE_MAINTENANCE ||
        pmDetails.taskCategory === TaskCategories.PREVENTIVE_MAINTENANCE
          ? pmDetails.taskCategory
          : 'TASK';
      const messageText = CommentsMessages.TEAM_MEMBER_REMOVED.replace(
        '{type}',
        enumToTile(messageType),
      );
      await this.sendTeamMemberUpdateNotification(
        requestUser,
        pmDetails,
        userId,
        messageText,
      );
      return {
        message: 'Team member remove to preventive maintenance',
        data: { teamMember },
      };
    } catch (error) {
      throw error;
    }
  }

  async deleteMany(pmIds: string[]): Promise<BaseResponseDto> {
    try {
      await this.pmTeamMembersRepository.delete({
        preventiveMaintenance: In(pmIds),
      });
      return {
        message: 'Team members delete to preventive maintenance',
      };
    } catch (error) {
      throw error;
    }
  }

  async removeForMaster(
    masterPmId: string,
    userId: string,
    requestUser?: User,
  ): Promise<CreatePreventiveMaintenanceTeamMemberResponseDto> {
    try {
      const [isExistForMaster, findCurrentPM, findCurrentPMs] =
        await Promise.all([
          this.masterPmTeamMembersRepository.findOneBy({
            user: { id: userId },
            masterPreventiveMaintenance: { id: masterPmId },
          }),
          this.pmService.findOneByMasterPmId(masterPmId),
          this.pmService.findFutureAndCurrentPMs(masterPmId),
        ]);
      const isExist = await this.pmTeamMembersRepository.findOneBy({
        user: { id: userId },
        preventiveMaintenance: { id: findCurrentPM.id },
      });
      if (!isExistForMaster) {
        throw new NotFoundException(
          'Preventive maintenance Team member does not exist',
        );
      }
      if (isExist) {
        await this.pmTeamMembersRepository.delete({
          preventiveMaintenance: In(findCurrentPMs.map((pm) => pm.id)),
          user: In([userId]),
        });
      }
      const teamMember = await this.masterPmTeamMembersRepository.remove(
        isExistForMaster,
      );
      const messageType =
        findCurrentPM.taskCategory === TaskCategories.CORRECTIVE_MAINTENANCE ||
        findCurrentPM.taskCategory === TaskCategories.PREVENTIVE_MAINTENANCE
          ? findCurrentPM.taskCategory
          : 'TASK';
      const messageText = CommentsMessages.TEAM_MEMBER_REMOVED.replace(
        '{type}',
        enumToTile(messageType),
      );
      await this.sendTeamMemberUpdateNotification(
        requestUser,
        findCurrentPM,
        userId,
        messageText,
      );
      return {
        message: 'Team member remove to master preventive maintenance',
        data: { teamMember },
      };
    } catch (error) {
      throw error;
    }
  }

  async insertMany(pmTeamMembers) {
    try {
      return await this.pmTeamMembersRepository.insert(pmTeamMembers);
    } catch (error) {
      throw error;
    }
  }

  async insertManyMaster(masterPmTeamMembers) {
    try {
      return await this.masterPmTeamMembersRepository.insert(
        masterPmTeamMembers,
      );
    } catch (error) {
      throw error;
    }
  }

  async createAndRemove(pmId: string, userIds: string[]): Promise<void> {
    try {
      const timestamp = dateToUTC();

      const existingTms = await this.pmTeamMembersRepository
        .createQueryBuilder('tm')
        .select('tm.user', 'userId')
        .where('tm.preventiveMaintenance = :pmId', { pmId })
        .getRawMany();

      const existingUserIds = new Set(existingTms.map((tm) => tm.userId));
      const incomingUserIds = new Set(userIds);

      const toRemove = [...existingUserIds].filter(
        (id) => !incomingUserIds.has(id),
      );
      const toAdd = [...incomingUserIds].filter(
        (id) => !existingUserIds.has(id),
      );
      if (toRemove.length) {
        await this.pmTeamMembersRepository.delete({
          preventiveMaintenance: { id: pmId },
          user: In(toRemove),
        });
      }
      if (toAdd.length) {
        const insertData = toAdd.map((userId) => ({
          user: userId,
          preventiveMaintenance: pmId,
          createdAt: timestamp,
          updatedAt: timestamp,
        }));
        await this.insertMany(insertData);
      }
    } catch (error) {
      console.error('Error in createAndRemove (PM Team Members):', error);
      throw error;
    }
  }

  async createAndRemoveMaster(
    masterPmId: string,
    userIds: string[],
    pmIds: string[],
  ) {
    try {
      const timestamp = dateToUTC();
      const existingAssignees = await this.masterPmTeamMembersRepository
        .createQueryBuilder('tm')
        .select('tm.user', 'userId')
        .where('tm.masterPreventiveMaintenance = :masterPmId', {
          masterPmId,
        })
        .getRawMany();
      const existingUserIds = new Set(existingAssignees.map((a) => a.userId));
      const incomingUserIds = new Set(userIds);
      // Assets to remove and add
      const toRemove = [...existingUserIds].filter(
        (id) => !incomingUserIds.has(id),
      );
      const toAdd = [...incomingUserIds].filter(
        (id) => !existingUserIds.has(id),
      );

      if (toRemove.length) {
        this.masterPmTeamMembersRepository.delete({
          masterPreventiveMaintenance: { id: masterPmId },
          user: In(toRemove),
        });
        if (pmIds.length) {
          await this.pmTeamMembersRepository.delete({
            preventiveMaintenance: In(pmIds),
            user: In(toRemove),
          });
        }
      }
      // Add new associations
      if (toAdd.length) {
        const masterAssignees = toAdd.map((user) => ({
          masterPreventiveMaintenance: masterPmId,
          user,
          createdAt: timestamp,
          updatedAt: timestamp,
        }));

        await this.insertManyMaster(masterAssignees);

        if (pmIds.length) {
          const pmAssignees = pmIds.flatMap((pmId) =>
            toAdd.map((user) => ({
              preventiveMaintenance: pmId,
              user,
              createdAt: timestamp,
              updatedAt: timestamp,
            })),
          );

          await this.insertMany(pmAssignees);
        }
      }
    } catch (error) {
      console.error('Error in createAndRemoveMaster (PM Team Members)', error);
      throw error;
    }
  }

  async sendTeamMemberUpdateNotification(
    user: User,
    pm: PreventiveMaintenances,
    teamMemberId: string,
    messageText: string,
  ) {
    try {
      const { pmType, workId, workTitle, area, asset } = pm;
      const deviceIds = await this.userFcmTokenService.findFcmTokensByUserIds([
        teamMemberId,
      ]);

      const requestUser = `${user.first_name} ${user.last_name}`;
      const message = `${requestUser} ${messageText}`;

      const notification = {
        workId,
        workTitle,
        type: pmType,
        // areaId: area?.id || '',
        // assetId: asset?.id || '',
        // assetName: asset?.name || '',
        // assetPackageName: area?.name || '',
        userId: user.id,
      };
      await Promise.all([
        this.notificationService.createPmNotification(
          // saving notifcation in the db
          pm,
          messageText,
          user.id,
          true,
          [{ id: teamMemberId }] as any,
        ),
        this.notificationService.sendNotificationToMultipleDevices(
          // sending push notifications to the devices
          deviceIds,
          message,
          notification,
        ),
      ]);
    } catch (error) {
      console.log('error in sendTeamMemberUpdateNotification: ', error);
    }
  }
}
