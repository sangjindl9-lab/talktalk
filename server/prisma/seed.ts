/**
 * 톡톡 Talk Talk 시드
 * - 지역(시군구), 관리자 계정(권한별), 관리자 설정, 상설 지역방
 * - 개발/검수용 테스트 계정(운영 환경에서는 생성하지 않음)
 */
import { PrismaClient, AdminRole } from '@prisma/client';
import { randomBytes, scryptSync } from 'crypto';

const prisma = new PrismaClient();
const isProduction = (process.env.NODE_ENV ?? 'development') === 'production';

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

const REGIONS = [
  { code: '51130', name: '원주시', city: '강원특별자치도', lat: 37.3422, lng: 127.9202 },
  { code: '51110', name: '춘천시', city: '강원특별자치도', lat: 37.8813, lng: 127.73 },
  { code: '51150', name: '강릉시', city: '강원특별자치도', lat: 37.7519, lng: 128.8761 },
  { code: '51190', name: '횡성군', city: '강원특별자치도', lat: 37.4917, lng: 127.9852 },
  { code: '11230', name: '강남구', city: '서울특별시', lat: 37.5172, lng: 127.0473 },
  { code: '11440', name: '마포구', city: '서울특별시', lat: 37.5663, lng: 126.9014 },
  { code: '41110', name: '수원시', city: '경기도', lat: 37.2636, lng: 127.0286 },
  { code: '41130', name: '성남시', city: '경기도', lat: 37.42, lng: 127.1265 },
];

const ADMINS: { email: string; name: string; role: AdminRole; password: string }[] = [
  { email: 'admin@talktalk.eumsoft.co.kr', name: '최고관리자', role: 'SUPERADMIN', password: process.env.ADMIN_BOOTSTRAP_PASSWORD ?? 'Admin!2345' },
  { email: 'moderator@talktalk.eumsoft.co.kr', name: '신고담당', role: 'MODERATOR', password: 'Moderator!2345' },
  { email: 'support@talktalk.eumsoft.co.kr', name: '고객지원', role: 'SUPPORT', password: 'Support!2345' },
  { email: 'finance@talktalk.eumsoft.co.kr', name: '정산담당', role: 'FINANCE', password: 'Finance!2345' },
];

const DEV_USERS = [
  { phone: '010-1000-0001', nickname: '원주러버', ageBand: '30s', interests: ['카페', '산책'], bio: '원주에서 커피 마시는 걸 좋아해요.', gender: 'FEMALE' as const },
  { phone: '010-1000-0002', nickname: '치악산바람', ageBand: '40s', interests: ['등산', '사진'], bio: '주말마다 치악산에 갑니다.', gender: 'MALE' as const },
  { phone: '010-1000-0003', nickname: '동네책방', ageBand: '20s', interests: ['독서', '카페'], bio: '독서 모임 같이 하실 분?', gender: 'NONE' as const },
  { phone: '010-1000-0004', nickname: '혁신도시러', ageBand: '30s', interests: ['운동', '맛집'], bio: '퇴근 후 맛집 탐방합니다.', gender: 'MALE' as const },
  { phone: '010-1000-0005', nickname: '반곡동주민', ageBand: '50s', interests: ['요리', '봉사'], bio: '반곡동에서 20년 살았어요.', gender: 'FEMALE' as const },
  { phone: '010-1000-0006', nickname: '춘천감자', ageBand: '20s', interests: ['여행', '게임'], bio: '춘천에서 원주로 출퇴근합니다.', gender: 'NONE' as const },
];

async function main(): Promise<void> {
  console.log('[seed] 톡톡 Talk Talk 시드 시작');

  for (const region of REGIONS) {
    await prisma.region.upsert({
      where: { code: region.code },
      create: { ...region, isActive: true },
      update: { name: region.name, city: region.city, lat: region.lat, lng: region.lng, isActive: true },
    });
  }
  console.log(`[seed] 지역 ${REGIONS.length}건`);

  for (const admin of ADMINS) {
    // 운영 환경: 소스에 적힌 기본 비밀번호를 쓰는 보조 관리자 계정은 임의 비밀번호로 잠금
    // (최고관리자가 관리자 웹에서 계정을 새로 발급해 사용)
    const lockDefault = isProduction && admin.role !== 'SUPERADMIN';
    const passwordHash = hashPassword(lockDefault ? randomBytes(32).toString('hex') : admin.password);
    await prisma.adminUser.upsert({
      where: { email: admin.email },
      create: { email: admin.email, name: admin.name, role: admin.role, passwordHash },
      update: lockDefault ? { name: admin.name, role: admin.role, passwordHash } : { name: admin.name, role: admin.role },
    });
  }
  console.log(`[seed] 관리자 ${ADMINS.length}건 (최고관리자: ${ADMINS[0].email})`);

  const settings: { key: string; value: unknown }[] = [
    { key: 'price.multiNote', value: 50 },
    { key: 'price.promotePerDay', value: 300 },
    { key: 'price.regionBrowse', value: 100 },
    { key: 'price.roomCapacityExpandPer10', value: 500 },
    { key: 'content.filterEnabled', value: true },
    { key: 'app.maintenance', value: false },
    { key: 'identity.provider', value: { provider: 'dev', adultOnly: true, minAge: 19 } },
  ];
  for (const setting of settings) {
    await prisma.adminSetting.upsert({
      where: { key: setting.key },
      create: { key: setting.key, value: setting.value as never },
      update: { value: setting.value as never },
    });
  }
  console.log(`[seed] 설정 ${settings.length}건`);

  // 상설 지역방
  for (const region of REGIONS) {
    const existing = await prisma.chatRoom.findFirst({ where: { type: 'REGION', regionCode: region.code } });
    if (!existing) {
      await prisma.chatRoom.create({
        data: {
          type: 'REGION',
          title: `${region.name} 지역방`,
          description: `${region.name} 이웃들이 모여 이야기하는 상설 지역방입니다.`,
          regionCode: region.code,
          searchable: true,
          capacity: null,
          lastMessageAt: new Date(),
        },
      });
    }
  }
  console.log('[seed] 상설 지역방 준비 완료');

  const noticeCount = await prisma.notice.count();
  if (noticeCount === 0) {
    await prisma.notice.create({
      data: {
        title: '톡톡 Talk Talk 서비스 이용 안내',
        pinned: true,
        body: [
          '톡톡 Talk Talk는 동네 이웃과 가볍게 인사하고 대화하는 서비스입니다.',
          '',
          '· 만 19세 이상 본인확인 회원만 이용할 수 있습니다.',
          '· 첫 인사(쪽지)는 1건의 짧은 텍스트만 보낼 수 있으며 수락 전에는 사진·외부 링크를 보낼 수 없습니다.',
          '· 서로 수락하면 1개의 1:1 대화방이 만들어집니다.',
          '· 신고·차단 기능을 통해 언제든 대화를 중단할 수 있습니다.',
        ].join('\n'),
      },
    });
  }

  if (!isProduction && process.env.SEED_DEV_USERS !== '0') {
    for (const [index, user] of DEV_USERS.entries()) {
      const region = REGIONS[index % 3];
      const existing = await prisma.user.findUnique({ where: { phone: user.phone } });
      if (existing) continue;
      const created = await prisma.user.create({
        data: {
          phone: user.phone,
          phoneVerifiedAt: new Date(),
          realName: `테스트${index + 1}`,
          birthDate: new Date(1990 + (index % 8), (index % 12), 10),
          isAdult: true,
          identityVerified: true,
          identityProvider: 'dev',
          nickname: user.nickname,
          ageBand: user.ageBand,
          regionCode: region.code,
          regionName: region.name,
          interests: user.interests,
          bio: user.bio,
          gender: user.gender,
          genderVisible: true,
          pointAccount: { create: { balance: 5000 } },
        },
      });
      await prisma.pointTransaction.create({
        data: {
          userId: created.id,
          type: 'BONUS',
          amount: 5000,
          balanceAfter: 5000,
          memo: '개발/검수용 테스트 포인트',
        },
      });
    }
    console.log(`[seed] 개발용 테스트 계정 ${DEV_USERS.length}건 (인증번호 123456)`);
  } else {
    console.log('[seed] 운영 환경: 테스트 계정을 생성하지 않았습니다 (가짜 회원 금지)');
  }

  console.log('[seed] 완료');
}

main()
  .catch((e) => {
    console.error('[seed] 실패', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
