import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { ContractManagementImportFilesDto } from './create-contract-management.dto';

export class UpdateContractManagementDto {
  @ApiProperty()
  @IsOptional()
  @IsString()
  description: string;

  @ApiProperty()
  @IsOptional()
  @IsString()
  contractNumber: string;

  @ApiProperty()
  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => parseFloat(value))
  contractAmount: number;

  @ApiProperty()
  @IsOptional()
  @IsString()
  comments: string;

  @ApiProperty()
  @IsOptional()
  @IsDateString()
  startDate: string;

  @ApiProperty()
  @IsOptional()
  @IsDateString()
  endDate: string;

  @ApiProperty()
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true')
  isRecurring: boolean;

  @ApiProperty()
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ContractManagementImportFilesDto)
  importFiles: ContractManagementImportFilesDto[];

  @ApiProperty({
    type: [String],
  })
  @IsArray()
  @IsOptional()
  deletedFilesIds: string[];
}
