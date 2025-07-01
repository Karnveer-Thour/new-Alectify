import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import {
  GetAllMasterPreventiveMaintenanceParamsDto,
  GetAllMasterPreventiveMaintenanceQueryDto,
  GetAllMasterPreventiveMaintenanceResponseDto,
} from './dto/get-all-master-preventive-maintenance.dto';
import { MasterPreventiveMaintenanceService } from './master-preventive-maintenances.service';
import { ApiOkResponse } from '@nestjs/swagger';
import { PreventiveMaintenancesExportService } from './preventive-maintenances-exporter.service';

@Controller('master-preventive-maintenances')
export class MasterPreventiveMaintenanceController {
  constructor(
    private readonly masterPmService: MasterPreventiveMaintenanceService,
    private readonly pmExportService: PreventiveMaintenancesExportService,
  ) {}

  @ApiOkResponse({
    type: GetAllMasterPreventiveMaintenanceResponseDto,
  })
  @Get()
  async findAll(
    @Req() req,
    @Query()
    {
      limit = 10,
      page = 1,
      orderField = null,
      orderBy = null,
      assetId = null,
      areaId = null,
      assetName = null,
      areaName = null,
      search = null,
      dueDate = null,
      projectId = null,
      subProjectId = null,
      isRecurring = null,
      pmType = null,
    }: GetAllMasterPreventiveMaintenanceQueryDto,
  ): Promise<GetAllMasterPreventiveMaintenanceResponseDto> {
    return this.masterPmService.findAll(
      req.user,
      projectId,
      subProjectId,
      pmType,
      orderField,
      orderBy,
      assetId,
      areaId,
      assetName,
      areaName,
      isRecurring,
      search,
      dueDate,
      {
        page,
        limit,
        route: req.protocol + '://' + req.get('host') + req.path,
      },
    );
  }

  @Get(':id/assets-areas')
  findOneAssetsAndAreas(@Param('id', ParseUUIDPipe) id: string) {
    return this.masterPmService.findOneAssetsAndAreas(id);
  }

  @ApiOkResponse({
    type: GetAllMasterPreventiveMaintenanceResponseDto,
  })
  @Get(':projectId/:subProjectId/:pmType')
  async findAllWithFilters(
    @Req() req,
    @Param()
    {
      projectId,
      subProjectId,
      pmType,
    }: GetAllMasterPreventiveMaintenanceParamsDto,
    @Query()
    {
      limit = 10,
      page = 1,
      orderField = null,
      orderBy = null,
      assetId = null,
      areaId = null,
      assetName = null,
      areaName = null,
      assignees = null,
      approvers = null,
      teamMembers = null,
      createdById = null,
      search = null,
      dueDate = null,
      projectIds = null,
      taskCategory = null,
    }: GetAllMasterPreventiveMaintenanceQueryDto,
  ): Promise<GetAllMasterPreventiveMaintenanceResponseDto> {
    return this.masterPmService.findAllWithFilters(
      req.user,
      projectId,
      projectIds,
      subProjectId,
      pmType,
      orderField,
      orderBy,
      assetId,
      areaId,
      assetName,
      areaName,
      assignees,
      approvers,
      teamMembers,
      createdById,
      search,
      taskCategory,
      dueDate,
      {
        page,
        limit,
        route: req.protocol + '://' + req.get('host') + req.path,
      },
    );
  }

  @Get('download')
  downloadMasterWOAsCsv(
    @Req() req,
    @Res() res,
    @Query()
    {
      projectId = null,
      isRecurring,
    }: GetAllMasterPreventiveMaintenanceQueryDto,
  ) {
    return this.masterPmService.downloadMasterWOAsCsv(
      req.user,
      projectId,
      isRecurring,
      res,
    );
  }

  @Get('download/:id')
  downloadProjectSparePartsAsCsv(
    @Req() req,
    @Res() res,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.pmExportService.exportCSVPMsByMasterPmId(res, req.user, id);
  }
}
