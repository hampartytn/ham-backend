import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { permissionsToSeedForRole } from '../src/common/constants/permissions';
import { localeMapFromTriplet } from '../src/common/utils/localized-name';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is required to seed');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

type Named = {
  code: string;
  nameEn: string;
  nameTa: string;
  nameHi: string;
};

function namesOf(row: Named) {
  return localeMapFromTriplet(row.nameEn, row.nameTa, row.nameHi);
}

const skillCategories: Array<Named & { skills: Named[] }> = [
  {
    code: 'construction',
    nameEn: 'Construction',
    nameTa: 'கட்டுமானம்',
    nameHi: 'निर्माण',
    skills: [
      {
        code: 'mason',
        nameEn: 'Mason',
        nameTa: 'கொத்தனார்',
        nameHi: 'राजमिस्त्री',
      },
      {
        code: 'carpenter',
        nameEn: 'Carpenter',
        nameTa: 'தச்சர்',
        nameHi: 'बढ़ई',
      },
      {
        code: 'electrician',
        nameEn: 'Electrician',
        nameTa: 'மின்சார தொழிலாளி',
        nameHi: 'इलेक्ट्रीशियन',
      },
      {
        code: 'plumber',
        nameEn: 'Plumber',
        nameTa: 'குழாய் பணி',
        nameHi: 'प्लंबर',
      },
      { code: 'welder', nameEn: 'Welder', nameTa: 'வெல்டர்', nameHi: 'वेल्डर' },
      { code: 'painter', nameEn: 'Painter', nameTa: 'ஓவியர்', nameHi: 'पेंटर' },
    ],
  },
  {
    code: 'driving',
    nameEn: 'Driving',
    nameTa: 'ஓட்டுதல்',
    nameHi: 'ड्राइविंग',
    skills: [
      {
        code: 'lmv',
        nameEn: 'LMV driver',
        nameTa: 'எல்.எம்.வி ஓட்டுநர்',
        nameHi: 'एलएमवी चालक',
      },
      {
        code: 'hmv',
        nameEn: 'HMV driver',
        nameTa: 'எச்.எம்.வி ஓட்டுநர்',
        nameHi: 'एचएमवी चालक',
      },
      {
        code: 'two_wheeler',
        nameEn: 'Two-wheeler rider',
        nameTa: 'இருசக்கர ஓட்டி',
        nameHi: 'दो पहिया चालक',
      },
    ],
  },
  {
    code: 'hospitality',
    nameEn: 'Hospitality',
    nameTa: 'விருந்தோம்பல்',
    nameHi: 'आतिथ्य',
    skills: [
      { code: 'cook', nameEn: 'Cook', nameTa: 'சமையல்காரர்', nameHi: 'रसोइया' },
      {
        code: 'waiter',
        nameEn: 'Waiter',
        nameTa: 'பரிமாறுபவர்',
        nameHi: 'वेटर',
      },
      {
        code: 'housekeeping',
        nameEn: 'Housekeeping',
        nameTa: 'வீட்டுப் பராமரிப்பு',
        nameHi: 'हाउसकीपिंग',
      },
    ],
  },
  {
    code: 'domestic',
    nameEn: 'Domestic work',
    nameTa: 'வீட்டு வேலை',
    nameHi: 'घरेलू कार्य',
    skills: [
      {
        code: 'domestic_helper',
        nameEn: 'Domestic helper',
        nameTa: 'வீட்டு உதவியாளர்',
        nameHi: 'घरेलू सहायक',
      },
      {
        code: 'caregiver',
        nameEn: 'Caregiver',
        nameTa: 'பராமரிப்பாளர்',
        nameHi: 'देखभालकर्ता',
      },
    ],
  },
  {
    code: 'manufacturing',
    nameEn: 'Manufacturing',
    nameTa: 'உற்பத்தி',
    nameHi: 'विनिर्माण',
    skills: [
      {
        code: 'machine_operator',
        nameEn: 'Machine operator',
        nameTa: 'இயந்திர இயக்குபவர்',
        nameHi: 'मशीन ऑपरेटर',
      },
      { code: 'packer', nameEn: 'Packer', nameTa: 'பேக்கர்', nameHi: 'पैकर' },
      {
        code: 'quality_checker',
        nameEn: 'Quality checker',
        nameTa: 'தர சரிபார்ப்பாளர்',
        nameHi: 'गुणवत्ता जाँच',
      },
    ],
  },
  {
    code: 'agriculture',
    nameEn: 'Agriculture',
    nameTa: 'விவசாயம்',
    nameHi: 'कृषि',
    skills: [
      {
        code: 'farm_labour',
        nameEn: 'Farm labour',
        nameTa: 'விவசாயத் தொழிலாளி',
        nameHi: 'कृषि मजदूर',
      },
      {
        code: 'harvest_worker',
        nameEn: 'Harvest worker',
        nameTa: 'அறுவடைத் தொழிலாளி',
        nameHi: 'कटाई मजदूर',
      },
    ],
  },
  {
    code: 'logistics',
    nameEn: 'Logistics',
    nameTa: 'தளவாடம்',
    nameHi: 'लॉजिस्टिक्स',
    skills: [
      { code: 'loader', nameEn: 'Loader', nameTa: 'ஏற்றுபவர்', nameHi: 'लोडर' },
      {
        code: 'warehouse_helper',
        nameEn: 'Warehouse helper',
        nameTa: 'கிடங்கு உதவியாளர்',
        nameHi: 'गोदाम सहायक',
      },
      {
        code: 'delivery',
        nameEn: 'Delivery worker',
        nameTa: 'விநியோகத் தொழிலாளி',
        nameHi: 'डिलीवरी कार्यकर्ता',
      },
    ],
  },
];

const districts: Named[] = [
  {
    code: 'ARIYALUR',
    nameEn: 'Ariyalur',
    nameTa: 'அரியலூர்',
    nameHi: 'अरियलूर',
  },
  {
    code: 'CHENGALPATTU',
    nameEn: 'Chengalpattu',
    nameTa: 'செங்கல்பட்டு',
    nameHi: 'चेंगलपट्टु',
  },
  { code: 'CHENNAI', nameEn: 'Chennai', nameTa: 'சென்னை', nameHi: 'चेन्नई' },
  {
    code: 'COIMBATORE',
    nameEn: 'Coimbatore',
    nameTa: 'கோயம்புத்தூர்',
    nameHi: 'कोयंबटूर',
  },
  { code: 'CUDDALORE', nameEn: 'Cuddalore', nameTa: 'கடலூர்', nameHi: 'कडलूर' },
  {
    code: 'DHARMAPURI',
    nameEn: 'Dharmapuri',
    nameTa: 'தர்மபுரி',
    nameHi: 'धर्मपुरी',
  },
  {
    code: 'DINDIGUL',
    nameEn: 'Dindigul',
    nameTa: 'திண்டுக்கல்',
    nameHi: 'दिंडुकल',
  },
  { code: 'ERODE', nameEn: 'Erode', nameTa: 'ஈரோடு', nameHi: 'ईरोड' },
  {
    code: 'KALLAKURICHI',
    nameEn: 'Kallakurichi',
    nameTa: 'கள்ளக்குறிச்சி',
    nameHi: 'कल्लाकुरीचि',
  },
  {
    code: 'KANCHIPURAM',
    nameEn: 'Kanchipuram',
    nameTa: 'காஞ்சிபுரம்',
    nameHi: 'कांचीपुरम',
  },
  {
    code: 'KANYAKUMARI',
    nameEn: 'Kanniyakumari',
    nameTa: 'கன்னியாகுமரி',
    nameHi: 'कन्याकुमारी',
  },
  { code: 'KARUR', nameEn: 'Karur', nameTa: 'கரூர்', nameHi: 'करूर' },
  {
    code: 'KRISHNAGIRI',
    nameEn: 'Krishnagiri',
    nameTa: 'கிருஷ்ணகிரி',
    nameHi: 'कृष्णगिरि',
  },
  { code: 'MADURAI', nameEn: 'Madurai', nameTa: 'மதுரை', nameHi: 'मदुरै' },
  {
    code: 'MAYILADUTHURAI',
    nameEn: 'Mayiladuthurai',
    nameTa: 'மயிலாடுதுறை',
    nameHi: 'मयिलाडुतुरै',
  },
  {
    code: 'NAGAPATTINAM',
    nameEn: 'Nagapattinam',
    nameTa: 'நாகப்பட்டினம்',
    nameHi: 'नागपट्टिनम',
  },
  {
    code: 'NAMAKKAL',
    nameEn: 'Namakkal',
    nameTa: 'நாமக்கல்',
    nameHi: 'नामक्कल',
  },
  {
    code: 'NILGIRIS',
    nameEn: 'The Nilgiris',
    nameTa: 'நீலகிரி',
    nameHi: 'नीलगिरी',
  },
  {
    code: 'PERAMBALUR',
    nameEn: 'Perambalur',
    nameTa: 'பெரம்பலூர்',
    nameHi: 'पेरम्बलूर',
  },
  {
    code: 'PUDUKOTTAI',
    nameEn: 'Pudukkottai',
    nameTa: 'புதுக்கோட்டை',
    nameHi: 'पुदुकोट्टई',
  },
  {
    code: 'RAMANATHAPURAM',
    nameEn: 'Ramanathapuram',
    nameTa: 'ராமநாதபுரம்',
    nameHi: 'रामनाथपुरम',
  },
  {
    code: 'RANIPET',
    nameEn: 'Ranipet',
    nameTa: 'ராணிப்பேட்டை',
    nameHi: 'रानीपेट',
  },
  { code: 'SALEM', nameEn: 'Salem', nameTa: 'சேலம்', nameHi: 'सेलम' },
  {
    code: 'SIVAGANGA',
    nameEn: 'Sivaganga',
    nameTa: 'சிவகங்கை',
    nameHi: 'शिवगंगा',
  },
  { code: 'TENKASI', nameEn: 'Tenkasi', nameTa: 'தென்காசி', nameHi: 'तेनकासी' },
  {
    code: 'THANJAVUR',
    nameEn: 'Thanjavur',
    nameTa: 'தஞ்சாவூர்',
    nameHi: 'तंजावुर',
  },
  { code: 'THENI', nameEn: 'Theni', nameTa: 'தேனி', nameHi: 'तेनी' },
  {
    code: 'THOOTHUKUDI',
    nameEn: 'Thoothukudi',
    nameTa: 'தூத்துக்குடி',
    nameHi: 'तूतुकुड़ी',
  },
  {
    code: 'TIRUCHIRAPPALLI',
    nameEn: 'Tiruchirappalli',
    nameTa: 'திருச்சிராப்பள்ளி',
    nameHi: 'तिरुचिरापल्ली',
  },
  {
    code: 'TIRUNELVELI',
    nameEn: 'Tirunelveli',
    nameTa: 'திருநெல்வேலி',
    nameHi: 'तिरुनेलवेली',
  },
  {
    code: 'TIRUPATHUR',
    nameEn: 'Tirupathur',
    nameTa: 'திருப்பத்தூர்',
    nameHi: 'तिरुपथूर',
  },
  {
    code: 'TIRUPPUR',
    nameEn: 'Tiruppur',
    nameTa: 'திருப்பூர்',
    nameHi: 'तिरुपुर',
  },
  {
    code: 'TIRUVALLUR',
    nameEn: 'Tiruvallur',
    nameTa: 'திருவள்ளூர்',
    nameHi: 'तिरुवल्लुर',
  },
  {
    code: 'TIRUVANNAMALAI',
    nameEn: 'Tiruvannamalai',
    nameTa: 'திருவண்ணாமலை',
    nameHi: 'तिरुवन्नामलाई',
  },
  {
    code: 'TIRUVARUR',
    nameEn: 'Tiruvarur',
    nameTa: 'திருவாரூர்',
    nameHi: 'तिरुवारूर',
  },
  { code: 'VELLORE', nameEn: 'Vellore', nameTa: 'வேலூர்', nameHi: 'वेल्लोर' },
  {
    code: 'VILUPPURAM',
    nameEn: 'Viluppuram',
    nameTa: 'விழுப்புரம்',
    nameHi: 'विलुप्पुरम',
  },
  {
    code: 'VIRUDHUNAGAR',
    nameEn: 'Virudhunagar',
    nameTa: 'விருதுநகர்',
    nameHi: 'विरुधुनगर',
  },
];

const cities: Array<Named & { districtCode: string; areas?: Named[] }> = [
  {
    districtCode: 'CHENNAI',
    code: 'CHENNAI',
    nameEn: 'Chennai',
    nameTa: 'சென்னை',
    nameHi: 'चेन्नई',
    areas: [
      {
        code: 'T_NAGAR',
        nameEn: 'T. Nagar',
        nameTa: 'தியாகராய நகர்',
        nameHi: 'टी. नगर',
      },
      {
        code: 'PERAMBUR',
        nameEn: 'Perambur',
        nameTa: 'பெரம்பூர்',
        nameHi: 'पेरम्बूर',
      },
      {
        code: 'TAMBARAM',
        nameEn: 'Tambaram',
        nameTa: 'தாம்பரம்',
        nameHi: 'ताम्बरम',
      },
    ],
  },
  {
    districtCode: 'COIMBATORE',
    code: 'COIMBATORE',
    nameEn: 'Coimbatore',
    nameTa: 'கோயம்புத்தூர்',
    nameHi: 'कोयंबटूर',
    areas: [
      {
        code: 'PEELAMEDU',
        nameEn: 'Peelamedu',
        nameTa: 'பீளமேடு',
        nameHi: 'पीलामेदु',
      },
      {
        code: 'GANDHIPURAM',
        nameEn: 'Gandhipuram',
        nameTa: 'காந்திபுரம்',
        nameHi: 'गांधीपुरम',
      },
    ],
  },
  {
    districtCode: 'MADURAI',
    code: 'MADURAI',
    nameEn: 'Madurai',
    nameTa: 'மதுரை',
    nameHi: 'मदुरै',
    areas: [
      {
        code: 'ANNA_NAGAR',
        nameEn: 'Anna Nagar',
        nameTa: 'அண்ணா நகர்',
        nameHi: 'अन्ना नगर',
      },
    ],
  },
  {
    districtCode: 'TIRUCHIRAPPALLI',
    code: 'TIRUCHIRAPPALLI',
    nameEn: 'Tiruchirappalli',
    nameTa: 'திருச்சிராப்பள்ளி',
    nameHi: 'तिरुचिरापल्ली',
  },
  {
    districtCode: 'SALEM',
    code: 'SALEM',
    nameEn: 'Salem',
    nameTa: 'சேலம்',
    nameHi: 'सेलम',
  },
  {
    districtCode: 'TIRUNELVELI',
    code: 'TIRUNELVELI',
    nameEn: 'Tirunelveli',
    nameTa: 'திருநெல்வேலி',
    nameHi: 'तिरुनेलवेली',
  },
  {
    districtCode: 'ERODE',
    code: 'ERODE',
    nameEn: 'Erode',
    nameTa: 'ஈரோடு',
    nameHi: 'ईरोड',
  },
  {
    districtCode: 'VELLORE',
    code: 'VELLORE',
    nameEn: 'Vellore',
    nameTa: 'வேலூர்',
    nameHi: 'वेल्लोर',
  },
  {
    districtCode: 'THOOTHUKUDI',
    code: 'THOOTHUKUDI',
    nameEn: 'Thoothukudi',
    nameTa: 'தூத்துக்குடி',
    nameHi: 'तूतुकुड़ी',
  },
  {
    districtCode: 'THANJAVUR',
    code: 'THANJAVUR',
    nameEn: 'Thanjavur',
    nameTa: 'தஞ்சாवூர்',
    nameHi: 'तंजावुर',
  },
];

const supportCategories: Named[] = [
  {
    code: 'advocate',
    nameEn: 'Advocate',
    nameTa: 'வழக்கறிஞர்',
    nameHi: 'अधिवक्ता',
  },
  {
    code: 'labour_helpline',
    nameEn: 'Labour helpline',
    nameTa: 'தொழிலாளர் உதவி எண்',
    nameHi: 'श्रम हेल्पलाइन',
  },
  {
    code: 'legal_aid',
    nameEn: 'Legal aid',
    nameTa: 'சட்ட உதவி',
    nameHi: 'कानूनी सहायता',
  },
];

async function seedSkills() {
  for (const category of skillCategories) {
    const saved = await prisma.skillCategory.upsert({
      where: { code: category.code },
      update: {
        names: namesOf(category),
      },
      create: {
        code: category.code,
        names: namesOf(category),
      },
    });

    for (const skill of category.skills) {
      await prisma.skill.upsert({
        where: { code: skill.code },
        update: {
          categoryId: saved.id,
          names: namesOf(skill),
          isActive: true,
        },
        create: {
          categoryId: saved.id,
          code: skill.code,
          names: namesOf(skill),
        },
      });
    }
  }
}

async function seedGeography() {
  const districtIds = new Map<string, string>();

  for (const district of districts) {
    const saved = await prisma.district.upsert({
      where: { code: district.code },
      update: {
        names: namesOf(district),
        isActive: true,
      },
      create: {
        code: district.code,
        names: namesOf(district),
      },
    });
    districtIds.set(district.code, saved.id);
  }

  for (const city of cities) {
    const districtId = districtIds.get(city.districtCode);
    if (!districtId) {
      throw new Error(`Missing district ${city.districtCode}`);
    }

    const savedCity = await prisma.city.upsert({
      where: {
        districtId_code: { districtId, code: city.code },
      },
      update: {
        names: namesOf(city),
        isActive: true,
      },
      create: {
        districtId,
        code: city.code,
        names: namesOf(city),
      },
    });

    for (const area of city.areas ?? []) {
      await prisma.area.upsert({
        where: {
          cityId_code: { cityId: savedCity.id, code: area.code },
        },
        update: {
          names: namesOf(area),
          isActive: true,
        },
        create: {
          cityId: savedCity.id,
          code: area.code,
          names: namesOf(area),
        },
      });
    }
  }
}

async function seedWelfare() {
  const rows = [
    {
      slug: 'insurance',
      titleEn: 'Insurance',
      titleTa: 'காப்பீடு',
      titleHi: 'बीमा',
    },
    {
      slug: 'welfare',
      titleEn: 'Worker welfare',
      titleTa: 'தொழிலாளர் நலன்',
      titleHi: 'श्रमिक कल्याण',
    },
  ];

  for (const row of rows) {
    await prisma.welfareContent.upsert({
      where: { slug: row.slug },
      update: {
        titles: localeMapFromTriplet(row.titleEn, row.titleTa, row.titleHi),
      },
      create: {
        slug: row.slug,
        titles: localeMapFromTriplet(row.titleEn, row.titleTa, row.titleHi),
        bodies: {},
      },
    });
  }
}

async function seedSupportCategories() {
  for (const category of supportCategories) {
    await prisma.supportProviderCategory.upsert({
      where: { code: category.code },
      update: {
        names: namesOf(category),
        isActive: true,
      },
      create: {
        code: category.code,
        names: namesOf(category),
      },
    });
  }
}

async function seedDevAdmin() {
  const enabled = process.env.SEED_DEV_ADMIN === 'true';
  const isDevelopment = process.env.NODE_ENV === 'development';
  if (!enabled || !isDevelopment) {
    return;
  }

  const phone = process.env.SEED_DEV_ADMIN_PHONE;
  const password = process.env.SEED_DEV_ADMIN_PASSWORD;
  if (!phone || !password) {
    console.warn(
      'SEED_DEV_ADMIN is true but phone or password is missing; skipping admin seed',
    );
    return;
  }

  const argon2 = await import('argon2');
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

  const user = await prisma.user.upsert({
    where: { phone },
    update: {},
    create: {
      role: 'SUPER_ADMIN',
      phone,
      phoneVerifiedAt: new Date(),
      passwordHash,
      accountStatus: 'ACTIVE',
      preferredLanguage: 'en',
    },
  });

  const grants = permissionsToSeedForRole(user.role);
  for (const permission of grants) {
    await prisma.adminUserPermission.upsert({
      where: {
        userId_permission: { userId: user.id, permission },
      },
      update: {},
      create: {
        userId: user.id,
        permission,
        createdByUserId: user.id,
      },
    });
  }
}

async function seedMembershipPlans() {
  await prisma.membershipPlan.upsert({
    where: { code: 'employee-ham-membership' },
    update: {
      names: localeMapFromTriplet(
        'Employee HAM Membership',
        'பணியாளர் HAM உறுப்பினர்',
        'कर्मचारी HAM सदस्यता',
      ),
      amountPaise: 9900,
      currency: 'INR',
      isActive: true,
    },
    create: {
      code: 'employee-ham-membership',
      names: localeMapFromTriplet(
        'Employee HAM Membership',
        'பணியாளர் HAM உறுப்பினர்',
        'कर्मचारी HAM सदस्यता',
      ),
      amountPaise: 9900,
      currency: 'INR',
      isActive: true,
    },
  });
  await prisma.membershipPlan.upsert({
    where: { code: 'employer-ham-membership' },
    update: {
      names: localeMapFromTriplet(
        'Employer HAM Membership',
        'முதலாளி HAM உறுப்பினர்',
        'नियोक्ता HAM सदस्यता',
      ),
      amountPaise: 9900,
      currency: 'INR',
      isActive: true,
    },
    create: {
      code: 'employer-ham-membership',
      names: localeMapFromTriplet(
        'Employer HAM Membership',
        'முதலாளி HAM உறுப்பினர்',
        'नियोक्ता HAM सदस्यता',
      ),
      amountPaise: 9900,
      currency: 'INR',
      isActive: true,
    },
  });
}

async function main() {
  await seedSkills();
  await seedGeography();
  await seedWelfare();
  await seedSupportCategories();
  await seedMembershipPlans();
  await seedDevAdmin();
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
