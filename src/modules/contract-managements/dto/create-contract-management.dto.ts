import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { UserTypes } from 'modules/users/models/user-types.enum';

export class ContractManagementImportFilesDto {
  @IsString()
  @IsOptional()
  fileName: string;

  @IsString()
  @IsOptional()
  filePath: string;

  @IsString()
  @IsOptional()
  fileType: string;

  @IsString()
  @IsOptional()
  uploadedBy: string;
}

export class CreateContractManagementDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsUUID()
  projectId: string;

  @ApiProperty()
  @IsOptional()
  @IsString()
  description: string;

  @ApiProperty()
  @IsOptional()
  @IsString()
  contractNumber: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsNumber()
  @Transform(({ value }) => parseFloat(value))
  contractAmount: number;

  @ApiProperty()
  @IsOptional()
  @IsString()
  comments: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsDateString()
  startDate: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsDateString()
  endDate: string;

  @ApiProperty()
  @IsBoolean()
  @Transform(({ value }) => value === 'true')
  isRecurring: boolean;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  organizationName: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsEmail()
  email: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  firstName: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  lastName: string;

  @ApiProperty()
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ContractManagementImportFilesDto)
  importFiles: ContractManagementImportFilesDto[];
}
