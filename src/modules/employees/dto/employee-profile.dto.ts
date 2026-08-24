import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export class PatchEmployeeProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(150)
  fullName?: string;

  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @IsOptional()
  @IsIn(['MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY'])
  gender?: 'MALE' | 'FEMALE' | 'OTHER' | 'PREFER_NOT_TO_SAY';

  @IsOptional()
  @IsUUID('7')
  districtId?: string;

  @IsOptional()
  @IsUUID('7')
  cityId?: string;

  @IsOptional()
  @IsUUID('7')
  areaId?: string;

  @IsOptional()
  @IsIn(['AVAILABLE', 'NOT_AVAILABLE', 'AVAILABLE_FROM'])
  availabilityStatus?: 'AVAILABLE' | 'NOT_AVAILABLE' | 'AVAILABLE_FROM';

  @ValidateIf(
    (dto: PatchEmployeeProfileDto) =>
      dto.availabilityStatus === 'AVAILABLE_FROM',
  )
  @IsDateString()
  availableFrom?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  bio?: string;
}

export class EmployeeSkillItemDto {
  @IsUUID('7')
  skillId!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(80)
  yearsExperience?: number;
}

export class ReplaceEmployeeSkillsDto {
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => EmployeeSkillItemDto)
  skills!: EmployeeSkillItemDto[];
}
