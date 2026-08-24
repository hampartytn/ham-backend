import { IsOptional, IsUUID, ValidateIf } from 'class-validator';
import { OffsetQueryDto } from '../../../common/dto/offset-query.dto';

export class ListLegalProvidersQueryDto extends OffsetQueryDto {
  @ValidateIf(
    (query: ListLegalProvidersQueryDto) => !query.cityId && !query.areaId,
  )
  @IsUUID('7')
  districtId?: string;

  @IsOptional()
  @IsUUID('7')
  cityId?: string;

  @IsOptional()
  @IsUUID('7')
  areaId?: string;

  @IsOptional()
  @IsUUID('7')
  categoryId?: string;
}

export type CoverageInput = {
  districtId: string;
  cityId?: string;
  areaId?: string;
};

export type CreateSupportProviderInput = {
  categoryId: string;
  name: string;
  description?: string;
  trustLevel: 'PLATFORM_VERIFIED' | 'PUBLIC_LISTING';
  approvalStatus?: 'DRAFT' | 'APPROVED' | 'REJECTED';
  phone?: string;
  email?: string;
  addressText?: string;
  coverages: CoverageInput[];
};

export type UpdateSupportProviderInput = {
  name?: string;
  description?: string;
  trustLevel?: 'PLATFORM_VERIFIED' | 'PUBLIC_LISTING';
  approvalStatus?: 'DRAFT' | 'APPROVED' | 'REJECTED';
  phone?: string;
  email?: string;
  addressText?: string;
};
