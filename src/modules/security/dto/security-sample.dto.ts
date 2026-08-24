import { IsNotEmpty, IsString } from 'class-validator';

export class SecuritySampleDto {
  @IsString()
  @IsNotEmpty()
  ping!: string;
}
