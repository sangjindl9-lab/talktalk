/** 유해 콘텐츠 필터 (금칙어·연락처·외부 유도 패턴) */
const BANNED = [
  '씨발', '시발', '병신', '지랄', '개새끼', '존나', '좆', '니미',
  '섹스', '야동', '조건만남', '원조교제', '성매매', '몸캠', '카톡아이디', '오픈채팅',
  '대출', '도박', '토토', '바카라', '카지노', '코인리딩', '리딩방', '주식리딩',
  '수익보장', '고수익', '부업알바', '폰팅', '출장마사지',
];

const CONTACT = /(0\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4})|(\b\d{3}[-.\s]?\d{2}[-.\s]?\d{3}[-.\s]?\d{4}\b)/;

export interface FilterResult {
  allowed: boolean;
  reason?: string;
  matched?: string;
}

export function filterContent(text: string | null | undefined, opts: { allowContact?: boolean } = {}): FilterResult {
  if (!text) return { allowed: true };
  const normalized = text.replace(/\s+/g, '').toLowerCase();
  for (const word of BANNED) {
    if (normalized.includes(word)) {
      return { allowed: false, reason: 'BANNED_WORD', matched: word };
    }
  }
  if (!opts.allowContact && CONTACT.test(text)) {
    return { allowed: false, reason: 'PHONE_NUMBER_EXPOSED' };
  }
  return { allowed: true };
}

export function assertClean(text: string | null | undefined, opts?: { allowContact?: boolean }): void {
  const result = filterContent(text, opts);
  if (!result.allowed) {
    const { BadRequestException } = require('@nestjs/common');
    throw new BadRequestException({
      code: result.reason === 'PHONE_NUMBER_EXPOSED' ? 'CONTACT_INFO_BLOCKED' : 'PROHIBITED_CONTENT',
      message:
        result.reason === 'PHONE_NUMBER_EXPOSED'
          ? '연락처(전화번호)는 대화 요청에 포함할 수 없습니다.'
          : '사용할 수 없는 표현이 포함되어 있습니다.',
    });
  }
}
