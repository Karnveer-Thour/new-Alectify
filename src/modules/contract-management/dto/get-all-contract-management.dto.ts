import { BaseResponseDto } from '@common/dto/base-response.dto';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsObject } from 'class-validator';
import { IPaginationLinks, IPaginationMeta } from 'nestjs-typeorm-paginate';
import {
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { ContractManagementResponseDto } from './create-contract-management-response.dto';

export class GetAllContractManagementResponseDto extends BaseResponseDto {
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
  })
  @IsOptional()
  @IsString()
  contactUserById: string;

  @ApiProperty({
    required: false,
  })
  @IsOptional()
  @IsString()
  orderField: string;

  @ApiProperty({
    required: false,
  })
  @IsOptional()
  @IsString()
  orderBy: 'ASC' | 'DESC';
}

export class GetOneContractManagementResponseDto extends BaseResponseDto {
  @ApiProperty()
  @IsObject()
  data: ContractManagementResponseDto;
}
