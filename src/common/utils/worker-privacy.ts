import { localizedName } from './localized-name';

export type AllowlistedSkill = {
  skillId: string;
  code: string;
  name: string;
  yearsExperience: number | null;
};

export type AllowlistedWorker = {
  id: string;
  fullName: string | null;
  districtId: string | null;
  availabilityStatus: string;
  availableFrom: Date | null;
  skills: AllowlistedSkill[];
  identityVerified: boolean;
};

export function toAllowlistedSkills(
  language: string,
  skills: Array<{
    skillId: string;
    yearsExperience: number | null;
    skill: { code: string; names: unknown };
  }>,
): AllowlistedSkill[] {
  return skills.map((row) => ({
    skillId: row.skillId,
    code: row.skill.code,
    name: localizedName(language, row.skill.names),
    yearsExperience: row.yearsExperience,
  }));
}

export function toAllowlistedWorker(
  language: string,
  profile: {
    id: string;
    fullName: string | null;
    districtId: string | null;
    availabilityStatus: string;
    availableFrom: Date | null;
    skills: Array<{
      skillId: string;
      yearsExperience: number | null;
      skill: { code: string; names: unknown };
    }>;
  },
  identityVerified: boolean,
): AllowlistedWorker {
  return {
    id: profile.id,
    fullName: profile.fullName,
    districtId: profile.districtId,
    availabilityStatus: profile.availabilityStatus,
    availableFrom: profile.availableFrom,
    skills: toAllowlistedSkills(language, profile.skills),
    identityVerified,
  };
}
