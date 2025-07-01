import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
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
} from 'class-validator';
import { UserTypes } from 'modules/users/models/user-types.enum';

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

  @IsObject()
  @IsArray()
  @IsOptional()
  documents: Express.Multer.File[];

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
  first_name: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  last_name: string;

  @ApiProperty()
  @IsIn([UserTypes.CUSTOMER])
  @Transform(({ value }) => parseFloat(value))
  user_type: number;
}
