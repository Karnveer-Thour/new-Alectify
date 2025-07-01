import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class DeleteContractManagementDocumentDto {
  @ApiProperty()
  @IsOptional()
  @IsString()
  deletedComment: string;
}
