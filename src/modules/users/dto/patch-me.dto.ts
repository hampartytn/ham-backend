import { IsEmail, IsIn, IsOptional, IsString } from 'class-validator';

export class PatchMeDto {
  @IsOptional()
  @IsIn(['ta', 'en', 'hi'])
  preferredLanguage?: 'ta' | 'en' | 'hi';

  @IsOptional()
  @IsEmail()
  @IsString()
  email?: string;
}
