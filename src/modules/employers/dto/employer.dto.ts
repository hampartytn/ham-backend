import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';
import { OffsetQueryDto } from '../../../common/dto/offset-query.dto';

const E164_PHONE = /^\+[1-9]\d{7,14}$/;

export class PatchEmployerProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(150)
  fullName?: string;
}

export class UpsertOrganizationDto {
  @IsString()
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @Matches(E164_PHONE, { message: 'contactPhone must be E.164' })
  contactPhone?: string;

  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @IsOptional()
  @IsUUID('7')
  districtId?: string;

  @IsOptional()
  @IsUUID('7')
  cityId?: string;
}

export class WorkerSearchQueryDto extends OffsetQueryDto {
  @IsOptional()
  @IsUUID('7')
  districtId?: string;

  @IsOptional()
  @IsUUID('7')
  skillId?: string;

  @IsOptional()
  @IsIn(['AVAILABLE', 'NOT_AVAILABLE', 'AVAILABLE_FROM'])
  availabilityStatus?: 'AVAILABLE' | 'NOT_AVAILABLE' | 'AVAILABLE_FROM';
}
