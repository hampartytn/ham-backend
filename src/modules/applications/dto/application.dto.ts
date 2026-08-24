import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { OffsetQueryDto } from '../../../common/dto/offset-query.dto';

export class CreateApplicationDto {
  @IsUUID('7')
  jobId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  coverNote?: string;
}

export class EmployeeApplicationsQueryDto extends OffsetQueryDto {
  @IsOptional()
  @IsIn([
    'SUBMITTED',
    'VIEWED',
    'SHORTLISTED',
    'REJECTED',
    'WITHDRAWN',
    'HIRED',
  ])
  status?:
    'SUBMITTED' | 'VIEWED' | 'SHORTLISTED' | 'REJECTED' | 'WITHDRAWN' | 'HIRED';
}

export class EmployerApplicationsQueryDto extends OffsetQueryDto {
  @IsOptional()
  @IsIn([
    'SUBMITTED',
    'VIEWED',
    'SHORTLISTED',
    'REJECTED',
    'WITHDRAWN',
    'HIRED',
  ])
  status?:
    'SUBMITTED' | 'VIEWED' | 'SHORTLISTED' | 'REJECTED' | 'WITHDRAWN' | 'HIRED';
}

export class PatchApplicationStatusDto {
  @IsIn(['VIEWED', 'SHORTLISTED', 'REJECTED', 'HIRED'])
  status!: 'VIEWED' | 'SHORTLISTED' | 'REJECTED' | 'HIRED';
}
