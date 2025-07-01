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
  Query,
  Req,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { ContractManagementService } from './contract-management.service';
import { CreateContractManagementResponseDto } from './dto/create-contract-management-response.dto';
import { CreateContractManagementDto } from './dto/create-contract-management.dto';
import {
  disAllowedExtensions,
  getFileNameFromFiles,
} from '@common/utils/utils';
import {
  GetAllContractManagementQueryDto,
  GetAllContractManagementResponseDto,
} from './dto/get-all-contract-management.dto';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import { UpdateContractManagementDto } from './dto/update-contract-management.dto';
import { DeleteContractManagementDocumentDto } from './dto/delete-contract-management-document.dto';

@ApiBearerAuth()
@ApiTags('Contract Management')
@Controller('contract-management')
export class ContractManagementController {
  constructor(
    private readonly contractManagementService: ContractManagementService,
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
    return this.contractManagementService.create(
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
    }: GetAllContractManagementQueryDto,
  ): Promise<GetAllContractManagementResponseDto> {
    return this.contractManagementService.findAll(
      req.user,
      projectId,
      contactUserById,
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
    return this.contractManagementService.findOne(id);
  }

  @Patch(':id')
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
    return this.contractManagementService.update(
      req.user,
      req.headers.authorization,
      id,
      updateContractManagementDto,
      files,
    );
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.contractManagementService.softDeleteContractManagement(id);
  }

  @Delete('documents/:id')
  softDeleteDocument(
    @Req() req,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() { deletedComment }: DeleteContractManagementDocumentDto,
  ) {
    return this.contractManagementService.softDeleteContractManagementDocument(
      req.user,
      id,
      deletedComment,
    );
  }
}
