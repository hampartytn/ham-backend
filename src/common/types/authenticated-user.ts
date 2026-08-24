import { AccountStatus, Role } from '../../generated/prisma/enums';

export type JwtPayload = {
  sub: string;
  role: Role;
};

export type AuthenticatedUser = {
  id: string;
  role: Role;
  accountStatus: AccountStatus;
  phone: string;
  preferredLanguage: string;
};
