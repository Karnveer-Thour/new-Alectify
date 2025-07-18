import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { StatusFilters } from '../models/status-filter.enum';

export class GetAllSparePartsQueryDto {
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
  orderField: string;

  @ApiProperty({
    required: false,
  })
  @IsOptional()
  @IsString()
  orderBy: 'ASC' | 'DESC';

  @ApiProperty({
    required: false,
  })
  @IsOptional()
  categoryId: string | string[];

  @ApiProperty({
    required: false,
  })
  @IsOptional()
  @IsString()
  partNumber: string;

  @ApiProperty({
    required: false,
  })
  @IsOptional()
  @IsString()
  description: string;

  @ApiProperty({
    required: false,
  })
  @IsOptional()
  @IsString()
  preferredSupplierName: string;

  @ApiProperty({
    required: false,
  })
  @IsOptional()
  preferredSupplierId: string | string[];

  @ApiProperty({
    required: false,
  })
  @IsOptional()
  @IsString()
  system: string;

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
  search: string;

  @ApiProperty({
    required: false,
  })
  @IsOptional()
  @IsString()
  pendingOrdersOnly: string;

  @ApiProperty({
    required: false,
    enum: StatusFilters,
  })
  @IsOptional()
  @IsEnum(StatusFilters)
  status: StatusFilters;
}

export class GetSparePartStatsDto {
  @ApiProperty({
    required: false,
  })
  @IsOptional()
  @IsString()
  projectId: string;
}

export class GetSparePartStatsWithDateRangeDto {
  @ApiProperty({
    required: false,
  })
  @IsOptional()
  @IsString()
  projectId: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  startDate: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  endDate: string;
}
