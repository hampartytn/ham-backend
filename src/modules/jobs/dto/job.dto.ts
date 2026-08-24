import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { OffsetQueryDto } from '../../../common/dto/offset-query.dto';

const JOB_TYPES = [
  'FULL_TIME',
  'PART_TIME',
  'CONTRACT',
  'DAILY_WAGE',
  'OTHER',
] as const;

const WAGE_PERIODS = ['DAY', 'MONTH', 'PIECE'] as const;

export class CreateJobDto {
  @IsString()
  @MaxLength(200)
  title!: string;

  @IsString()
  @MaxLength(8000)
  description!: string;

  @IsIn(JOB_TYPES)
  jobType!: (typeof JOB_TYPES)[number];

  @IsUUID('7')
  districtId!: string;

  @IsOptional()
  @IsUUID('7')
  cityId?: string;

  @IsOptional()
  @IsUUID('7')
  areaId?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(999)
  vacancies!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  wageMinPaise?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  wageMaxPaise?: number;

  @ValidateIf(
    (dto: CreateJobDto) => dto.wageMinPaise != null || dto.wageMaxPaise != null,
  )
  @IsIn(WAGE_PERIODS)
  wagePeriod?: (typeof WAGE_PERIODS)[number];

  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID('7', { each: true })
  skillIds!: string[];

  @IsOptional()
  @IsIn(['DRAFT', 'PUBLISHED'])
  status?: 'DRAFT' | 'PUBLISHED';
}

export class PatchJobDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  description?: string;

  @IsOptional()
  @IsIn(JOB_TYPES)
  jobType?: (typeof JOB_TYPES)[number];

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
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(999)
  vacancies?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  wageMinPaise?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  wageMaxPaise?: number;

  @IsOptional()
  @IsIn(WAGE_PERIODS)
  wagePeriod?: (typeof WAGE_PERIODS)[number];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID('7', { each: true })
  skillIds?: string[];
}

export class EmployerJobsQueryDto extends OffsetQueryDto {
  @IsOptional()
  @IsIn(['DRAFT', 'PUBLISHED', 'UNPUBLISHED', 'CLOSED'])
  status?: 'DRAFT' | 'PUBLISHED' | 'UNPUBLISHED' | 'CLOSED';
}

export class JobFeedQueryDto {
  @IsOptional()
  @IsUUID('7')
  districtId?: string;

  @IsOptional()
  @IsUUID('7')
  cityId?: string;

  @IsOptional()
  @IsUUID('7')
  skillId?: string;

  @IsOptional()
  @IsIn(JOB_TYPES)
  jobType?: (typeof JOB_TYPES)[number];

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 20;
}
