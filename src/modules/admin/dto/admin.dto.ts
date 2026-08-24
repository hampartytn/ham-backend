import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { OffsetQueryDto } from '../../../common/dto/offset-query.dto';
import { ASSIGNABLE_ADMIN_PERMISSIONS } from '../../../common/constants/permissions';
import { E164_PHONE, PASSWORD_PATTERN } from '../../auth/dto/auth.dto';

const ROLES = ['EMPLOYEE', 'EMPLOYER', 'ADMIN', 'SUPER_ADMIN'] as const;
const ACCOUNT_STATUSES = [
  'PENDING_PHONE',
  'ACTIVE',
  'SUSPENDED',
  'BLOCKED',
] as const;
const JOB_STATUSES = ['DRAFT', 'PUBLISHED', 'UNPUBLISHED', 'CLOSED'] as const;
const TRUST_LEVELS = ['PLATFORM_VERIFIED', 'PUBLIC_LISTING'] as const;
const APPROVAL_STATUSES = ['DRAFT', 'APPROVED', 'REJECTED'] as const;

export class AdminUsersQueryDto extends OffsetQueryDto {
  @IsOptional()
  @IsIn(ROLES)
  role?: (typeof ROLES)[number];

  @IsOptional()
  @IsIn(ACCOUNT_STATUSES)
  accountStatus?: (typeof ACCOUNT_STATUSES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(128)
  q?: string;
}

export class AdminUserStatusDto {
  @IsIn(['ACTIVE', 'SUSPENDED', 'BLOCKED'])
  accountStatus!: 'ACTIVE' | 'SUSPENDED' | 'BLOCKED';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class AdminJobsQueryDto extends OffsetQueryDto {
  @IsOptional()
  @IsIn(JOB_STATUSES)
  status?: (typeof JOB_STATUSES)[number];

  @IsOptional()
  @IsUUID('7')
  organizationId?: string;
}

export class AdminLegalProvidersQueryDto extends OffsetQueryDto {
  @IsOptional()
  @IsIn(APPROVAL_STATUSES)
  approvalStatus?: (typeof APPROVAL_STATUSES)[number];
}

export class AdminCoverageDto {
  @IsUUID('7')
  districtId!: string;

  @IsOptional()
  @IsUUID('7')
  cityId?: string;

  @IsOptional()
  @IsUUID('7')
  areaId?: string;
}

export class AdminCreateLegalProviderDto {
  @IsUUID('7')
  categoryId!: string;

  @IsString()
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  @IsIn(TRUST_LEVELS)
  trustLevel!: (typeof TRUST_LEVELS)[number];

  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  addressText?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => AdminCoverageDto)
  coverages!: AdminCoverageDto[];
}

export class AdminPatchLegalProviderDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  @IsOptional()
  @IsIn(TRUST_LEVELS)
  trustLevel?: (typeof TRUST_LEVELS)[number];

  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  addressText?: string;
}

export class AdminAuditLogsQueryDto extends OffsetQueryDto {
  @IsOptional()
  @IsUUID('7')
  actorUserId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  action?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  targetType?: string;

  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;
}

export class AdminCreateAdminDto {
  @IsString()
  @Matches(E164_PHONE, { message: 'phone must be E.164' })
  phone!: string;

  @IsString()
  @MinLength(10)
  @Matches(PASSWORD_PATTERN, {
    message: 'password must be at least 10 characters and not only numeric',
  })
  password!: string;

  @IsArray()
  @IsIn(ASSIGNABLE_ADMIN_PERMISSIONS, { each: true })
  permissions!: string[];
}

export class AdminPatchPermissionsDto {
  @IsArray()
  @IsIn(ASSIGNABLE_ADMIN_PERMISSIONS, { each: true })
  permissions!: string[];
}
