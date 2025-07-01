import { Module } from '@nestjs/common';
import { ContractManagementService } from './contract-management.service';
import { ContractManagementController } from './contract-management.controller';
import { ContractManagementRepository } from './repositories/contract-management';
import { ProjectsModule } from 'modules/projects/projects.module';
import { UsersModule } from 'modules/users/users.module';
import { FilesUploadModule } from 'modules/files-upload/files-upload.module';
import { ContractManagementDocumentRepository } from './repositories/contract-management-document.repository';
import { OrganizationsModule } from 'modules/organizations/organizations.module';

@Module({
  imports: [
    ProjectsModule,
    UsersModule,
    OrganizationsModule,
    FilesUploadModule,
  ],
  controllers: [ContractManagementController],
  providers: [
    ContractManagementService,
    ContractManagementRepository,
    ContractManagementDocumentRepository,
  ],
})
export class ContractManagemnetModule {}
