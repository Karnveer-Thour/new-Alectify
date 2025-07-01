import { BaseResponseDto } from '@common/dto/base-response.dto';
import { ApiProperty } from '@nestjs/swagger';
import { IsObject } from 'class-validator';
import { ContractManagement } from '../entities/contract-management.entity';

export class ContractManagementResponseDto extends ContractManagement {
  @ApiProperty({
    description: 'Number of months between startDate and endDate',
  })
  term: number;
}

export class CreateContractManagementResponseDto extends BaseResponseDto {
  @ApiProperty()
  @IsObject()
  data: ContractManagementResponseDto;
}
