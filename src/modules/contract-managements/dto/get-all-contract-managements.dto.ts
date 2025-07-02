import { BaseResponseDto } from '@common/dto/base-response.dto';
import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { IPaginationLinks, IPaginationMeta } from 'nestjs-typeorm-paginate';
import { ContractManagementResponseDto } from './create-contract-management-response.dto';
import { ContractManagementsOrderFieldEnum } from '../models/contract-managements-order-field.enum';
import { ContractManagementsSortOrderEnum } from '../models/contract-managements-sort-order.enum';
import { ContractManagementStatusTypes } from '../models/contract-management-status-types.enum';
export class GetAllContractManagementsResponseDto extends BaseResponseDto {
  @ApiProperty()
  @IsObject()
  data: ContractManagementResponseDto[];

  @ApiProperty()
  @IsObject()
  links?: IPaginationLinks;

  @ApiProperty()
  @IsObject()
  meta?: IPaginationMeta;
}

export class GetAllContractManagementQueryDto {
  @ApiProperty({
    required: false,
    minimum: 1,
    title: 'Page',
    format: 'int32',
    default: 1,
  })
  @IsOptional()
  @Min(1)
  @IsNumber()
  @Type(() => Number)
  page: number;

  @ApiProperty({
    required: false,
    minimum: 2,
    maximum: 100,
    title: 'Limit',
    format: 'int32',
    default: 10,
  })
  @IsOptional()
  @Min(2)
  @IsNumber()
  @Type(() => Number)
  limit: number;

  @ApiProperty({
    required: false,
  })
  @IsOptional()
  @IsString()
  projectId: string;

  @ApiProperty({
    required: false,
    enum: ContractManagementStatusTypes,
  })
  @IsOptional()
  @IsEnum(ContractManagementStatusTypes)
  status: ContractManagementStatusTypes;

  @ApiProperty({
    required: false,
  })
  @IsOptional()
  @IsString()
  contactUserById: string;

  @ApiProperty({
    required: false,
    title: 'isActive',
    format: 'boolean',
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true')
  isActive: boolean;

  @ApiProperty({
    required: false,
    title: 'isRecurring',
    format: 'boolean',
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true')
  isRecurring: boolean;

  @ApiProperty({
    required: false,
    title: 'search',
  })
  @IsOptional()
  @IsString()
  search: string;

  @ApiProperty({
    required: false,
    enum: ContractManagementsOrderFieldEnum,
  })
  @IsOptional()
  @IsEnum(ContractManagementsOrderFieldEnum)
  orderField: ContractManagementsOrderFieldEnum;

  @ApiProperty({
    required: false,
    enum: ContractManagementsSortOrderEnum,
  })
  @IsOptional()
  @IsEnum(ContractManagementsSortOrderEnum)
  orderBy: ContractManagementsSortOrderEnum;
}

export class GetOneContractManagementResponseDto extends BaseResponseDto {
  @ApiProperty()
  @IsObject()
  data: ContractManagementResponseDto;
}
