import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { createArrayCsvWriter, createArrayCsvStringifier } from 'csv-writer';
import { PreventiveMaintenancesRepository } from './repositories/preventive-maintenances.repository';
import {
  cleanHtmlTags,
  displayDateWithTimeZoneWithOutSecond,
  enumToTile,
  getTimeZone,
  getTimeZoneShortForm,
  workOrderFrequencyInText,
} from '@common/utils/utils';
import { Statuses } from './models/status.enum';

@Injectable()
export class PreventiveMaintenancesExportService {
  constructor(private pmRepository: PreventiveMaintenancesRepository) {}

  async exportCSVPMsByMasterPmId(res, user, masterPmId: string) {
    const tasks = await this.pmRepository.findAllPMsByMasterId(masterPmId);
    const basicHeaders = [
      'Work Title',
      'Work Order Type',
      'Description',
      'Site',
      'Asset Category',
      'Priority',
      'Frequency',
    ];
    const basicDetails = [
      cleanHtmlTags(tasks[0].workTitle),
      enumToTile(tasks[0].taskCategory),
      cleanHtmlTags(tasks[0].detail),
      tasks[0].project?.name || '',
      tasks[0].subProject?.name || '',
      enumToTile(tasks[0].priority),
      workOrderFrequencyInText(tasks[0]),
    ];
    // const groupTasks = {
    //   Upcoming: [],
    //   Current: [],
    //   Past: [],
    // };
    const woData = [];

    for (const task of tasks) {
      // const record = [task.dueDate, enumToTile(task.status), task.isReopened];
      let status = 'Up Coming';
      if (task.isFuture) {
        // record.push('Up Coming');
        status = 'Up Coming';
        // groupTasks.Upcoming.push(record);
      } else if (
        !task.isFuture &&
        [
          Statuses.PENDING,
          Statuses.IN_PROGRESS,
          Statuses.WAITING_FOR_REVIEW,
        ].includes(task.status)
      ) {
        // record.push('Current');
        status = 'Current';
        // groupTasks.Current.push(record);
      } else {
        // record.push('Past');
        status = 'Past';
        // groupTasks.Past.push(record);
      }
      woData.push([
        status,
        task.dueDate,
        enumToTile(task.status),
        task.reviewedBy
          ? `${task.reviewedBy.first_name || ''} ${
              task.reviewedBy.last_name || ''
            } <${task.reviewedBy.email}>`
          : '-',
        task.reviewedAt || '-',
        task.estimatedHours || '-',
        task.estimatedCost || '-',
        task.completionAt || '-',
        cleanHtmlTags(task?.reviewComment?.text) || '-',
        task.completedBy
          ? `${task.completedBy.first_name || ''} ${
              task.completedBy.last_name || ''
            } <${task.completedBy.email}>`
          : '-',
        task.completedAt || '-',
        task.deniedBy
          ? `${task.deniedBy.first_name || ''} ${
              task.deniedBy.last_name || ''
            } <${task.deniedBy.email}>`
          : '-',
        task.deniedAt || '-',
        cleanHtmlTags(task?.deniedComment?.text) || '-',
        task.isReopened,
      ]);
    }

    const headers = [
      'Status',
      'Due Date',
      'WO Status',
      'Completed By',
      'Completed At',
      'Estimated Man Hours',
      'Estimated Cost',
      'Completion Date',
      'Completed Comments',
      'Reviewed & Closed By',
      'Reviewed & Closed At',
      'Denied By',
      'Denied At',
      'Denied Reason',
      'Is Reopened',
    ];
    const csvBasicStringifier = createArrayCsvStringifier({
      header: basicHeaders,
      alwaysQuote: true,
    });
    const csvStringifier = createArrayCsvStringifier({
      header: headers,
      alwaysQuote: true,
    });

    const csvChunks: string[] = [
      `WO Details\n`,
      csvBasicStringifier.getHeaderString(),
      csvBasicStringifier.stringifyRecords([basicDetails]),
      `\n`,
      `All WO\n`,
      csvStringifier.getHeaderString(),
      csvBasicStringifier.stringifyRecords(woData),
    ];

    // for (const [label, group] of Object.entries(groupTasks)) {
    //   if (group.length === 0) continue;

    //   csvChunks.push(`${label} WO\n`);
    //   csvChunks.push(csvStringifier.getHeaderString());
    //   csvChunks.push(csvStringifier.stringifyRecords(group));
    //   csvChunks.push('\n');
    // }

    const finalCSV = '\uFEFF' + csvChunks.join(''); // UTF-8 BOM for Excel

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="work-orders-${Date.now()}.csv"`,
    );
    res.send(finalCSV);
  }
  async exportCSVPMsByMasterPmIdOld(
    res,
    user,
    masterPmId: string,
  ): Promise<string> {
    const tasks = await this.pmRepository.findAllPMsByMasterId(masterPmId);

    const groupTasks = {
      Upcoming: [],
      Current: [],
      Past: [],
    };

    for (const task of tasks) {
      let projectTimezone = null;
      let projectTimezoneShortForm = null;
      if (task.project.latitude && task.project.longitude) {
        projectTimezone = getTimeZone(
          task.project.latitude,
          task.project.longitude,
        );
        projectTimezoneShortForm = getTimeZoneShortForm(projectTimezone);
      }
      const record = [
        task.id,
        task.workId,
        cleanHtmlTags(task.workTitle),
        enumToTile(task.taskCategory),
        cleanHtmlTags(task.detail),
        task.project?.name || '',
        task.subProject?.name || '',
        `${displayDateWithTimeZoneWithOutSecond(
          task.dueDate,
          false,
          projectTimezone,
        )} ${projectTimezoneShortForm ? `(${projectTimezoneShortForm})` : ''}}`,
        enumToTile(task.status),
        enumToTile(task.priority),
        this.formatUsers(task.assignees?.map((a) => a.user)),
        this.formatUsers(task.approvers?.map((a) => a.user)),
        this.formatUsers(task.team?.projectTeamMembers?.map((m) => m.user)),
        task.isReopened,
        workOrderFrequencyInText(task),
      ];
      console.log('task.status', task.status, task.isFuture);
      if (task.isFuture) {
        groupTasks.Upcoming.push(record);
      } else if (
        !task.isFuture &&
        [
          Statuses.PENDING,
          Statuses.IN_PROGRESS,
          Statuses.WAITING_FOR_REVIEW,
        ].includes(task.status)
      ) {
        groupTasks.Current.push(record);
      } else {
        groupTasks.Past.push(record);
      }
    }
    const records: string[][] = [];
    const columns = [
      'Id',
      'WO Id',
      'Work Title',
      'Work Order Type',
      'Description',
      'Project',
      'Subproject',
      'Due Date',
      'Status',
      'Priority',
      'Assignees',
      'Approvers',
      'Team Members',
      'Is Reopened',
      'Frequency',
    ];

    for (const [label, group] of Object.entries(groupTasks)) {
      if (group.length === 0) continue;
      records.push([`${label} WO`]); // Section title
      records.push(columns); // Header row
      records.push(...group);
      records.push([]); // Empty row between sections
    }

    const filePath = path.join(
      __dirname,
      '..',
      '..',
      'exports',
      `work-order-${Date.now()}.csv`,
    );
    fs.mkdirSync(path.dirname(filePath), { recursive: true });

    const writer = createArrayCsvWriter({
      path: filePath,
      alwaysQuote: true,
    });

    await writer.writeRecords(records);
    return filePath;
  }

  private formatUsers(users: any[] = []): string {
    return users
      .filter(Boolean)
      .map((u) => `${u.first_name || ''} ${u.last_name || ''} <${u.email}>`)
      .join(', ');
  }
}
