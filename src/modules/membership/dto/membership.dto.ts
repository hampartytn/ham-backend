import { Equals, IsBoolean, IsString, MaxLength } from 'class-validator';

export class JoinMembershipDto {
  @IsString()
  @MaxLength(64)
  termsVersion!: string;

  @IsBoolean()
  @Equals(true, { message: 'accepted must be true' })
  accepted!: true;
}

export class MembershipTermsDto {
  @IsString()
  @MaxLength(64)
  termsVersion!: string;
}
