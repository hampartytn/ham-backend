import { localizedName } from '../../common/utils/localized-name';

type JobSkillRow = {
  skillId: string;
  skill: { code: string; names: unknown };
};

type JobRecord = {
  id: string;
  organizationId: string;
  createdByUserId: string;
  title: string;
  description: string;
  jobType: string;
  status: string;
  districtId: string;
  cityId: string | null;
  areaId: string | null;
  vacancies: number;
  wageMinPaise: number | null;
  wageMaxPaise: number | null;
  wagePeriod: string | null;
  publishedAt: Date | null;
  closedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  organization: { id: string; name: string };
  skills: JobSkillRow[];
};

/** Feed/list rows omit description, audit fields, and organizationId (org id is on `organization`). */
type PublicJobListRecord = Omit<
  JobRecord,
  | 'description'
  | 'createdByUserId'
  | 'closedAt'
  | 'createdAt'
  | 'updatedAt'
  | 'organizationId'
>;

function publicJobFields(job: PublicJobListRecord, language: string) {
  return {
    id: job.id,
    title: job.title,
    jobType: job.jobType,
    status: job.status,
    districtId: job.districtId,
    cityId: job.cityId,
    areaId: job.areaId,
    vacancies: job.vacancies,
    wageMinPaise: job.wageMinPaise,
    wageMaxPaise: job.wageMaxPaise,
    wagePeriod: job.wagePeriod,
    publishedAt: job.publishedAt,
    organization: {
      id: job.organization.id,
      name: job.organization.name,
    },
    skills: job.skills.map((row) => ({
      skillId: row.skillId,
      code: row.skill.code,
      name: localizedName(language, row.skill.names),
    })),
  };
}

/** List/feed projection: omit description (detail still uses toPublicJobDto). */
export function toPublicJobListDto(job: PublicJobListRecord, language: string) {
  return publicJobFields(job, language);
}

export function toPublicJobDto(job: JobRecord, language: string) {
  return {
    ...publicJobFields(job, language),
    description: job.description,
  };
}

export function toEmployerJobDto(job: JobRecord, language: string) {
  return {
    ...toPublicJobDto(job, language),
    createdByUserId: job.createdByUserId,
    closedAt: job.closedAt,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}
