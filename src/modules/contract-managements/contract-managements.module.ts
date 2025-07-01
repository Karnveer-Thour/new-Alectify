import { Module } from '@nestjs/common';
import { ContractManagementsService } from './contract-managements.service';
import { ContractManagementsController } from './contract-managements.controller';
import { ContractManagementsRepository } from './repositories/contract-managements.repository';
import { ProjectsModule } from 'modules/projects/projects.module';
import { UsersModule } from 'modules/users/users.module';
import { FilesUploadModule } from 'modules/files-upload/files-upload.module';
import { ContractManagementDocumentsRepository } from './repositories/contract-management-documents.repository';
import { OrganizationsModule } from 'modules/organizations/organizations.module';
import { OperationApisModule } from 'modules/operation-apis/operation-apis.module';
import { ContractManagementDocumentsService } from './contract-managements-documents.service';

@Module({
  imports: [
    ProjectsModule,
    UsersModule,
    OrganizationsModule,
    FilesUploadModule,
    OperationApisModule,
  ],
  controllers: [ContractManagementsController],
  providers: [
    ContractManagementsService,
    ContractManagementDocumentsService,
    ContractManagementsRepository,
    ContractManagementDocumentsRepository,
  ],
})
export class ContractManagementsModule {}
