import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';

export const E164_PHONE = /^\+[1-9]\d{7,14}$/;
export const PASSWORD_PATTERN = /^(?!\d+$).{10,}$/;

export class RegisterDto {
  @IsString()
  @Matches(E164_PHONE, { message: 'phone must be E.164' })
  phone!: string;

  @IsIn(['EMPLOYEE', 'EMPLOYER'])
  role!: 'EMPLOYEE' | 'EMPLOYER';

  @IsIn(['ta', 'en', 'hi'])
  preferredLanguage!: 'ta' | 'en' | 'hi';

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MinLength(10)
  @Matches(PASSWORD_PATTERN, {
    message: 'password must be at least 10 characters and not only numeric',
  })
  password?: string;
}

export class OtpRequestDto {
  @IsString()
  @Matches(E164_PHONE, { message: 'phone must be E.164' })
  phone!: string;

  @IsIn(['REGISTER', 'LOGIN', 'PASSWORD_RESET'])
  purpose!: 'REGISTER' | 'LOGIN' | 'PASSWORD_RESET';
}

export class OtpVerifyDto {
  @IsString()
  @Matches(E164_PHONE, { message: 'phone must be E.164' })
  phone!: string;

  @IsIn(['REGISTER', 'LOGIN', 'PASSWORD_RESET'])
  purpose!: 'REGISTER' | 'LOGIN' | 'PASSWORD_RESET';

  @IsString()
  @IsNotEmpty()
  code!: string;
}

export class LoginDto {
  @IsString()
  @Matches(E164_PHONE, { message: 'phone must be E.164' })
  phone!: string;

  @IsString()
  @IsNotEmpty()
  password!: string;
}

export class RefreshDto {
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}

export class LogoutDto {
  @IsOptional()
  @IsString()
  refreshToken?: string;

  @IsOptional()
  @IsBoolean()
  allDevices?: boolean;
}

export class PasswordSetDto {
  @IsString()
  @MinLength(10)
  @Matches(PASSWORD_PATTERN, {
    message: 'password must be at least 10 characters and not only numeric',
  })
  password!: string;

  @IsOptional()
  @IsString()
  currentPassword?: string;
}

export class PasswordResetDto {
  @IsString()
  @Matches(E164_PHONE, { message: 'phone must be E.164' })
  phone!: string;

  @IsString()
  @IsNotEmpty()
  resetToken!: string;

  @IsString()
  @MinLength(10)
  @Matches(PASSWORD_PATTERN, {
    message: 'password must be at least 10 characters and not only numeric',
  })
  newPassword!: string;
}
