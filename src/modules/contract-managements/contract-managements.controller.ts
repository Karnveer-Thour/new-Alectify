import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { ContractManagementsService } from './contract-managements.service';
import { CreateContractManagementResponseDto } from './dto/create-contract-management-response.dto';
import { CreateContractManagementDto } from './dto/create-contract-management.dto';
import {
  disAllowedExtensions,
  getFileNameFromFiles,
} from '@common/utils/utils';
import {
  GetAllContractManagementQueryDto,
  GetAllContractManagementsResponseDto,
} from './dto/get-all-contract-managements.dto';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import { UpdateContractManagementDto } from './dto/update-contract-management.dto';
import { DeleteContractManagementDocumentDto } from './dto/delete-contract-management-document.dto';

@ApiBearerAuth()
@ApiTags('Contract Management')
@Controller('contract-management')
export class ContractManagementsController {
  constructor(
    private readonly contractManagementsService: ContractManagementsService,
  ) {}

  @ApiOkResponse({
    type: CreateContractManagementResponseDto,
  })
  @Post()
  @UseInterceptors(AnyFilesInterceptor())
  create(
    @Req() req,
    @Body() createContractManagementDto: CreateContractManagementDto,
    @UploadedFiles() files: Array<Express.Multer.File>,
  ): Promise<CreateContractManagementResponseDto> {
    if (files?.length) {
      const fileNames = getFileNameFromFiles(files);
      const checkFiles = disAllowedExtensions(fileNames);
      if (checkFiles.length) {
        throw new BadRequestException(
          `File type ${checkFiles[0]} is not allowed.`,
        );
      }
    }
    return this.contractManagementsService.create(
      req.user,
      req.headers.authorization,
      createContractManagementDto,
      files,
    );
  }

  @Get()
  findAll(
    @Req() req,
    @Query()
    {
      limit = 10,
      page = 1,
      projectId = null,
      contactUserById = null,
      orderField = null,
      orderBy = null,
      isActive = null,
      isRecurring = null,
      search = null,
    }: GetAllContractManagementQueryDto,
  ): Promise<GetAllContractManagementsResponseDto> {
    return this.contractManagementsService.findAll(
      req.user,
      projectId,
      contactUserById,
      isActive,
      isRecurring,
      search,
      orderField,
      orderBy,
      {
        page,
        limit,
        route: req.protocol + '://' + req.get('host') + req.path,
      },
    );
  }

  @ApiOkResponse({
    type: CreateContractManagementResponseDto,
  })
  @Get(':id')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CreateContractManagementResponseDto> {
    return this.contractManagementsService.findOne(id);
  }

  @Put(':id')
  @UseInterceptors(AnyFilesInterceptor())
  update(
    @Req() req,
    @Param('id') id: string,
    @Body() updateContractManagementDto: UpdateContractManagementDto,
    @UploadedFiles() files: Array<Express.Multer.File>,
  ) {
    if (files?.length) {
      const fileNames = getFileNameFromFiles(files);
      const checkFiles = disAllowedExtensions(fileNames);
      if (checkFiles.length) {
        throw new BadRequestException(
          `File type ${checkFiles[0]} is not allowed.`,
        );
      }
    }
    return this.contractManagementsService.update(
      req.user,
      req.headers.authorization,
      id,
      updateContractManagementDto,
      files,
    );
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.contractManagementsService.softDeleteContractManagement(id);
  }

  @Delete('documents/:id')
  softDeleteDocument(
    @Req() req,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() { deletedComment }: DeleteContractManagementDocumentDto,
  ) {
    return this.contractManagementsService.softDeleteContractManagementDocument(
      req.user,
      id,
      deletedComment,
    );
  }
}
