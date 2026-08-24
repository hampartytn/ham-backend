import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));

const saveAuth = `const json = pm.response.json();
if (json && json.data && json.data.accessToken) {
  const role = json.data.user && json.data.user.role;
  pm.collectionVariables.set('accessToken', json.data.accessToken);
  pm.collectionVariables.set('refreshToken', json.data.refreshToken);
  pm.collectionVariables.set('userId', json.data.user.id);
  if (role === 'EMPLOYEE') {
    pm.collectionVariables.set('employeeAccessToken', json.data.accessToken);
    pm.collectionVariables.set('employeeRefreshToken', json.data.refreshToken);
    pm.collectionVariables.set('employeeUserId', json.data.user.id);
  }
  if (role === 'EMPLOYER') {
    pm.collectionVariables.set('employerAccessToken', json.data.accessToken);
    pm.collectionVariables.set('employerRefreshToken', json.data.refreshToken);
    pm.collectionVariables.set('employerUserId', json.data.user.id);
  }
  if (role === 'ADMIN' || role === 'SUPER_ADMIN') {
    pm.collectionVariables.set('adminAccessToken', json.data.accessToken);
    pm.collectionVariables.set('adminRefreshToken', json.data.refreshToken);
    pm.collectionVariables.set('adminUserId', json.data.user.id);
  }
}
`;

const saveFirst = (varName, extra = '') => `const json = pm.response.json();
if (json && Array.isArray(json.data) && json.data[0] && json.data[0].id) {
  pm.collectionVariables.set('${varName}', json.data[0].id);
}
${extra}`;

function headerJson() {
  return [{ key: 'Content-Type', value: 'application/json' }];
}

function bearer(tokenVar) {
  return {
    type: 'bearer',
    bearer: [{ key: 'token', value: `{{${tokenVar}}}`, type: 'string' }],
  };
}

function req(name, method, path, opts = {}) {
  const { body, auth, description, test, public: isPublic, formdata } = opts;
  const item = {
    name,
    request: {
      method,
      header: formdata || !body ? [] : headerJson(),
      url: `{{baseUrl}}${path}`,
      description: description || '',
    },
  };
  if (isPublic) {
    item.request.auth = { type: 'noauth' };
  } else if (auth) {
    item.request.auth = bearer(auth);
  }
  if (body !== undefined) {
    item.request.header = headerJson();
    item.request.body = {
      mode: 'raw',
      raw: JSON.stringify(body, null, 2),
      options: { raw: { language: 'json' } },
    };
  }
  if (formdata) {
    item.request.body = { mode: 'formdata', formdata };
  }
  if (test) {
    item.event = [
      {
        listen: 'test',
        script: { type: 'text/javascript', exec: test.split('\n') },
      },
    ];
  }
  return item;
}

const collection = {
  info: {
    name: 'ham-backend',
    description: [
      'HAM Job & Worker Welfare Platform API (`/api/v1`).',
      '',
      '## Import',
      '1. Postman → Import → `ham-backend.postman_collection.json`',
      '2. Optional: import `ham-backend.postman_environment.json` and select it',
      '',
      '## First run',
      '1. Confirm `GET /health` and `GET /ready`.',
      '2. Register employee (unique E.164 phone). Response is PENDING_PHONE — **no tokens**. A second register with the same phone is 409 CONFLICT; the first row is kept.',
      '3. OTP request with purpose `REGISTER`, copy the 6-digit code from the server `otp.mock` debug log into `otpCode` (set LOG_LEVEL=debug if you do not see it).',
      '4. OTP verify purpose `REGISTER` → account becomes ACTIVE and tokens are saved.',
      '5. After that, Login with phone+password works. Login before OTP verify returns 401 INVALID_CREDENTIALS.',
      '6. Repeat 2–5 for employer (purpose REGISTER, then Login employer).',
      '7. Catalog → Skills then Districts → Cities → Areas to fill ids.',
      '8. Admin routes need an existing ADMIN/SUPER_ADMIN (`SEED_DEV_ADMIN`).',
      '',
      'Do not put JWT secrets or DATABASE_URL in this collection. Placeholders only.',
      'Swagger UI: {{baseUrl}}/docs',
    ].join('\n'),
    schema:
      'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  },
  auth: bearer('accessToken'),
  variable: [
    { key: 'baseUrl', value: 'http://localhost:3000' },
    { key: 'accessToken', value: '' },
    { key: 'refreshToken', value: '' },
    { key: 'employeeAccessToken', value: '' },
    { key: 'employeeRefreshToken', value: '' },
    { key: 'employerAccessToken', value: '' },
    { key: 'employerRefreshToken', value: '' },
    { key: 'adminAccessToken', value: '' },
    { key: 'adminRefreshToken', value: '' },
    { key: 'employeePhone', value: '+919876543210' },
    { key: 'employerPhone', value: '+919876543211' },
    { key: 'adminPhone', value: '+919876543200' },
    { key: 'password', value: 'CorrectHorse1' },
    { key: 'otpCode', value: '' },
    { key: 'userId', value: '' },
    { key: 'employeeUserId', value: '' },
    { key: 'employerUserId', value: '' },
    { key: 'adminUserId', value: '' },
    { key: 'districtId', value: '' },
    { key: 'cityId', value: '' },
    { key: 'areaId', value: '' },
    { key: 'skillId', value: '' },
    { key: 'skillCategoryId', value: '' },
    { key: 'jobId', value: '' },
    { key: 'applicationId', value: '' },
    { key: 'fileId', value: '' },
    { key: 'verificationId', value: '' },
    { key: 'paymentId', value: '' },
    { key: 'legalCategoryId', value: '' },
    { key: 'legalProviderId', value: '' },
    { key: 'termsVersion', value: 'ham-membership-2026-08' },
  ],
  item: [
    {
      name: 'Health',
      item: [
        req('GET /health', 'GET', '/health', { public: true }),
        req('GET /ready', 'GET', '/ready', { public: true }),
        req('GET /docs (Swagger UI)', 'GET', '/docs', { public: true }),
      ],
    },
    {
      name: 'Auth',
      item: [
        req('Register employee', 'POST', '/api/v1/auth/register', {
          public: true,
          description:
            'Creates PENDING_PHONE. Does not issue tokens. Same phone again → 409 CONFLICT.',
          body: {
            phone: '{{employeePhone}}',
            role: 'EMPLOYEE',
            preferredLanguage: 'ta',
            password: '{{password}}',
          },
        }),
        req('OTP request (REGISTER)', 'POST', '/api/v1/auth/otp/request', {
          public: true,
          description:
            'purpose REGISTER only works while PENDING_PHONE. Copy otp from log `otp.mock` into otpCode.',
          body: { phone: '{{employeePhone}}', purpose: 'REGISTER' },
        }),
        req('OTP verify (REGISTER)', 'POST', '/api/v1/auth/otp/verify', {
          public: true,
          description:
            'Activates the account and returns tokens. Required before password login.',
          body: {
            phone: '{{employeePhone}}',
            purpose: 'REGISTER',
            code: '{{otpCode}}',
          },
          test: saveAuth,
        }),
        req('Register employer', 'POST', '/api/v1/auth/register', {
          public: true,
          body: {
            phone: '{{employerPhone}}',
            role: 'EMPLOYER',
            preferredLanguage: 'en',
            password: '{{password}}',
          },
        }),
        req(
          'OTP request employer (REGISTER)',
          'POST',
          '/api/v1/auth/otp/request',
          {
            public: true,
            body: { phone: '{{employerPhone}}', purpose: 'REGISTER' },
          },
        ),
        req(
          'OTP verify employer (REGISTER)',
          'POST',
          '/api/v1/auth/otp/verify',
          {
            public: true,
            body: {
              phone: '{{employerPhone}}',
              purpose: 'REGISTER',
              code: '{{otpCode}}',
            },
            test: saveAuth,
          },
        ),
        req('Login employee', 'POST', '/api/v1/auth/login', {
          public: true,
          body: { phone: '{{employeePhone}}', password: '{{password}}' },
          test: saveAuth,
        }),
        req('Login employer', 'POST', '/api/v1/auth/login', {
          public: true,
          body: { phone: '{{employerPhone}}', password: '{{password}}' },
          test: saveAuth,
        }),
        req('Login admin', 'POST', '/api/v1/auth/login', {
          public: true,
          body: { phone: '{{adminPhone}}', password: '{{password}}' },
          test: saveAuth,
        }),
        req('OTP request (LOGIN)', 'POST', '/api/v1/auth/otp/request', {
          public: true,
          description:
            'Only after the account is ACTIVE. Same generic 200 body even if the phone is unknown.',
          body: { phone: '{{employeePhone}}', purpose: 'LOGIN' },
        }),
        req('OTP verify (LOGIN)', 'POST', '/api/v1/auth/otp/verify', {
          public: true,
          body: {
            phone: '{{employeePhone}}',
            purpose: 'LOGIN',
            code: '{{otpCode}}',
          },
          test: saveAuth,
        }),
        req('Session', 'GET', '/api/v1/auth/session', {
          auth: 'accessToken',
        }),
        req('Refresh', 'POST', '/api/v1/auth/refresh', {
          public: true,
          body: { refreshToken: '{{refreshToken}}' },
          test: saveAuth,
        }),
        req('Set password', 'POST', '/api/v1/auth/password/set', {
          auth: 'accessToken',
          body: { password: '{{password}}' },
        }),
        req('OTP request password reset', 'POST', '/api/v1/auth/otp/request', {
          public: true,
          body: { phone: '{{employeePhone}}', purpose: 'PASSWORD_RESET' },
        }),
        req('Reset password', 'POST', '/api/v1/auth/password/reset', {
          public: true,
          description: 'resetToken comes from successful PASSWORD_RESET OTP verify.',
          body: {
            phone: '{{employeePhone}}',
            resetToken: '{{resetToken}}',
            newPassword: 'CorrectHorse2',
          },
        }),
        req('Logout', 'POST', '/api/v1/auth/logout', {
          public: true,
          body: { refreshToken: '{{refreshToken}}', allDevices: false },
        }),
      ],
    },
    {
      name: 'Users (me)',
      auth: bearer('accessToken'),
      item: [
        req('GET me', 'GET', '/api/v1/me'),
        req('PATCH me', 'PATCH', '/api/v1/me', {
          body: { preferredLanguage: 'en' },
        }),
      ],
    },
    {
      name: 'Catalog',
      auth: bearer('accessToken'),
      item: [
        req('Skills', 'GET', '/api/v1/skills', {
          test: saveFirst('skillId'),
        }),
        req('Skill categories', 'GET', '/api/v1/skill-categories', {
          test: saveFirst('skillCategoryId'),
        }),
        req('Districts', 'GET', '/api/v1/geo/districts', {
          test: saveFirst('districtId'),
        }),
        req('Cities', 'GET', '/api/v1/geo/districts/{{districtId}}/cities', {
          test: saveFirst('cityId'),
        }),
        req('Areas', 'GET', '/api/v1/geo/cities/{{cityId}}/areas', {
          test: saveFirst('areaId'),
        }),
      ],
    },
    {
      name: 'Employee',
      auth: bearer('employeeAccessToken'),
      item: [
        req('GET profile', 'GET', '/api/v1/employee/profile'),
        req('PATCH profile', 'PATCH', '/api/v1/employee/profile', {
          body: {
            fullName: 'Test Employee',
            gender: 'PREFER_NOT_TO_SAY',
            districtId: '{{districtId}}',
            cityId: '{{cityId}}',
            availabilityStatus: 'AVAILABLE',
            bio: 'Postman profile',
          },
        }),
        req('GET skills', 'GET', '/api/v1/employee/skills'),
        req('PUT skills', 'PUT', '/api/v1/employee/skills', {
          body: {
            skills: [{ skillId: '{{skillId}}', yearsExperience: 2 }],
          },
        }),
        req('POST profile image', 'POST', '/api/v1/employee/profile/image', {
          description: 'multipart field name is `file` (jpeg/png/webp, max 2 MiB).',
          formdata: [
            { key: 'file', type: 'file', src: [], description: 'Select an image' },
          ],
        }),
      ],
    },
    {
      name: 'Employer org',
      auth: bearer('employerAccessToken'),
      item: [
        req('GET profile', 'GET', '/api/v1/employer/profile'),
        req('PATCH profile', 'PATCH', '/api/v1/employer/profile', {
          body: { fullName: 'Test Employer' },
        }),
        req('PUT organization', 'PUT', '/api/v1/employer/organization', {
          body: {
            name: 'Postman Org',
            description: 'Test organization',
            districtId: '{{districtId}}',
            cityId: '{{cityId}}',
          },
        }),
        req('Worker search', 'GET', '/api/v1/employer/workers?page=1&limit=20'),
      ],
    },
    {
      name: 'Jobs (employee browse)',
      auth: bearer('employeeAccessToken'),
      item: [
        req('Feed', 'GET', '/api/v1/jobs?limit=20'),
        req('Get job', 'GET', '/api/v1/jobs/{{jobId}}'),
      ],
    },
    {
      name: 'Employer jobs',
      auth: bearer('employerAccessToken'),
      item: [
        req('Create job', 'POST', '/api/v1/employer/jobs', {
          body: {
            title: 'Mason needed',
            description: 'Postman job',
            jobType: 'FULL_TIME',
            districtId: '{{districtId}}',
            cityId: '{{cityId}}',
            vacancies: 1,
            wageMinPaise: 50000,
            wageMaxPaise: 80000,
            wagePeriod: 'DAY',
            skillIds: ['{{skillId}}'],
            status: 'DRAFT',
          },
          test: `const json = pm.response.json();
if (json && json.data && json.data.id) {
  pm.collectionVariables.set('jobId', json.data.id);
}
`,
        }),
        req('List my jobs', 'GET', '/api/v1/employer/jobs?page=1&limit=20'),
        req('Get my job', 'GET', '/api/v1/employer/jobs/{{jobId}}'),
        req('Patch job', 'PATCH', '/api/v1/employer/jobs/{{jobId}}', {
          body: { title: 'Mason needed (updated)' },
        }),
        req('Publish', 'POST', '/api/v1/employer/jobs/{{jobId}}/publish'),
        req('Close', 'POST', '/api/v1/employer/jobs/{{jobId}}/close'),
        req(
          'List applicants',
          'GET',
          '/api/v1/employer/jobs/{{jobId}}/applications?page=1&limit=20',
        ),
        req(
          'Patch applicant',
          'PATCH',
          '/api/v1/employer/jobs/{{jobId}}/applications/{{applicationId}}',
          { body: { status: 'VIEWED' } },
        ),
      ],
    },
    {
      name: 'Applications',
      auth: bearer('employeeAccessToken'),
      item: [
        req('Apply', 'POST', '/api/v1/applications', {
          body: { jobId: '{{jobId}}', coverNote: 'Interested' },
          test: `const json = pm.response.json();
if (json && json.data && json.data.id) {
  pm.collectionVariables.set('applicationId', json.data.id);
}
`,
        }),
        req('List mine', 'GET', '/api/v1/applications?page=1&limit=20'),
        req('Get one', 'GET', '/api/v1/applications/{{applicationId}}'),
        req(
          'Withdraw',
          'POST',
          '/api/v1/applications/{{applicationId}}/withdraw',
        ),
      ],
    },
    {
      name: 'Files',
      auth: bearer('accessToken'),
      item: [
        req('Download', 'GET', '/api/v1/files/{{fileId}}', {
          description: 'Authenticated download. Set fileId from profile image response.',
        }),
      ],
    },
    {
      name: 'Verification',
      auth: bearer('employeeAccessToken'),
      item: [
        req('Start', 'POST', '/api/v1/verification/start', {
          body: {},
          test: `const json = pm.response.json();
if (json && json.data && json.data.id) {
  pm.collectionVariables.set('verificationId', json.data.id);
}
`,
        }),
        req('Me', 'GET', '/api/v1/verification/me'),
        req('Mock complete', 'POST', '/api/v1/verification/mock/complete', {
          description: 'Development/test only. 404 in production.',
          body: {
            verificationId: '{{verificationId}}',
            result: 'SUCCEEDED',
          },
        }),
        req(
          'Webhook (provider)',
          'POST',
          '/api/v1/verification/webhooks/mock',
          {
            public: true,
            description:
              'Requires HMAC header X-Identity-Signature. Not for browser try-it without signing.',
            body: {
              eventId: 'evt-1',
              verificationId: '{{verificationId}}',
              result: 'SUCCEEDED',
              maskedIdentity: 'xxxx1234',
            },
          },
        ),
      ],
    },
    {
      name: 'Membership',
      auth: bearer('employeeAccessToken'),
      item: [
        req('GET membership', 'GET', '/api/v1/membership'),
        req('Info', 'GET', '/api/v1/membership/info'),
        req('Join', 'POST', '/api/v1/membership/join', {
          description: 'Requires successful verification. termsVersion from env.',
          body: {
            termsVersion: '{{termsVersion}}',
            accepted: true,
          },
        }),
        req('Decline', 'POST', '/api/v1/membership/decline', {
          body: { termsVersion: '{{termsVersion}}' },
        }),
        req('Withdraw', 'POST', '/api/v1/membership/withdraw', {
          description: 'Returns NOT_ENABLED until M9 is decided.',
        }),
      ],
    },
    {
      name: 'Legal support',
      auth: bearer('employeeAccessToken'),
      item: [
        req('Categories', 'GET', '/api/v1/legal-support/categories', {
          test: saveFirst('legalCategoryId'),
        }),
        req(
          'Providers',
          'GET',
          '/api/v1/legal-support/providers?districtId={{districtId}}&page=1&limit=20',
        ),
        req(
          'Get provider',
          'GET',
          '/api/v1/legal-support/providers/{{legalProviderId}}',
        ),
      ],
    },
    {
      name: 'Payments',
      auth: bearer('employerAccessToken'),
      item: [
        req('Initiate', 'POST', '/api/v1/payments/initiate', {
          description:
            'Amount is server-side. Extra card fields → 400. Stub may return NOT_ENABLED.',
          body: { purpose: 'EMPLOYER_ACTIVATION' },
          test: `const json = pm.response.json();
if (json && json.data && json.data.id) {
  pm.collectionVariables.set('paymentId', json.data.id);
}
`,
        }),
        req('Get payment', 'GET', '/api/v1/payments/{{paymentId}}'),
        req('Webhook (provider)', 'POST', '/api/v1/payments/webhooks/stub', {
          public: true,
          description: 'Requires HMAC header X-Payment-Signature.',
          body: {
            eventId: 'evt-1',
            providerOrderId: 'order-1',
            status: 'SUCCEEDED',
          },
        }),
      ],
    },
    {
      name: 'Admin',
      auth: bearer('adminAccessToken'),
      item: [
        req('Session', 'GET', '/api/v1/admin/session'),
        req('Permissions check', 'GET', '/api/v1/admin/permissions/check'),
        req('Users', 'GET', '/api/v1/admin/users?page=1&limit=20'),
        req('User detail', 'GET', '/api/v1/admin/users/{{userId}}'),
        req('Set user status', 'POST', '/api/v1/admin/users/{{userId}}/status', {
          body: { accountStatus: 'ACTIVE', reason: 'Postman' },
        }),
        req('Jobs', 'GET', '/api/v1/admin/jobs?page=1&limit=20'),
        req('Unpublish job', 'POST', '/api/v1/admin/jobs/{{jobId}}/unpublish'),
        req('Close job', 'POST', '/api/v1/admin/jobs/{{jobId}}/close'),
        req(
          'Legal providers',
          'GET',
          '/api/v1/admin/legal-support/providers?page=1&limit=20',
        ),
        req(
          'Create legal provider',
          'POST',
          '/api/v1/admin/legal-support/providers',
          {
            body: {
              categoryId: '{{legalCategoryId}}',
              name: 'Postman Advocate',
              trustLevel: 'PUBLIC_LISTING',
              coverages: [{ districtId: '{{districtId}}' }],
            },
            test: `const json = pm.response.json();
if (json && json.data && json.data.id) {
  pm.collectionVariables.set('legalProviderId', json.data.id);
}
`,
          },
        ),
        req(
          'Patch legal provider',
          'PATCH',
          '/api/v1/admin/legal-support/providers/{{legalProviderId}}',
          { body: { name: 'Postman Advocate 2' } },
        ),
        req(
          'Approve legal provider',
          'POST',
          '/api/v1/admin/legal-support/providers/{{legalProviderId}}/approve',
        ),
        req('Metrics', 'GET', '/api/v1/admin/metrics'),
        req('Audit logs', 'GET', '/api/v1/admin/audit-logs?page=1&limit=20'),
        req('Create admin', 'POST', '/api/v1/admin/admins', {
          description: 'SUPER_ADMIN only (admins.manage).',
          body: {
            phone: '+919876543222',
            password: 'CorrectHorse1',
            permissions: ['users.read', 'metrics.read'],
          },
        }),
        req(
          'Patch admin permissions',
          'PATCH',
          '/api/v1/admin/admins/{{userId}}/permissions',
          { body: { permissions: ['users.read'] } },
        ),
      ],
    },
  ],
};

const environment = {
  id: 'ham-backend-local',
  name: 'ham-backend local',
  values: [
    { key: 'baseUrl', value: 'http://localhost:3000', enabled: true },
  ],
};

writeFileSync(
  join(dir, 'ham-backend.postman_collection.json'),
  JSON.stringify(collection, null, 2),
);
writeFileSync(
  join(dir, 'ham-backend.postman_environment.json'),
  JSON.stringify(environment, null, 2),
);
console.log('Wrote Postman collection and environment');
