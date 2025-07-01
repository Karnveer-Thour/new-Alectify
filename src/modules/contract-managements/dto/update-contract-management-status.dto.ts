import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsNumber, IsUUID } from 'class-validator';
import { ContractManagementStatusTypes } from '../models/contract-management-status-types.enum';

export class UpdateContractManagementStatusDto {

   @ApiProperty()
    @IsNotEmpty()
    @IsUUID()
    id: string;
  
  @ApiProperty({
      enum: ContractManagementStatusTypes,
    })
  @IsNotEmpty()
  @IsEnum(ContractManagementStatusTypes, {
    message: 'status must be a valid StatusTypes enum value',
  })
  status: ContractManagementStatusTypes;
}
