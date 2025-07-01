import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNumber } from 'class-validator';
import { StatusTypes } from '../models/contract-management-status-types.enum';

export class UpdateContractManagementStatusDto {
  @ApiProperty()
  @IsEnum(StatusTypes, {
    message: 'status must be a valid StatusTypes enum value',
  })
  status: StatusTypes;
}
