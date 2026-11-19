import { Injectable } from '@nestjs/common';
import { BoardCategory, Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { assertClean } from '../common/moderation';
import { apiError, publicProfile } from '../common/util';
import { PromotionsService } from './promotions.service';

const CATEGORIES: Record<string, BoardCategory> = {
  DAILY: 'DAILY', QUESTION: 'QUESTION', HOBBY: 'HOBBY', GATHER: 'GATHER',
  일상: 'DAILY', 질문: 'QUESTION', 취미: 'HOBBY', 모임모집: 'GATHER',
};

@Injectable()
export class BoardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly promotions: PromotionsService,
  ) {}

  async list(userId: string, filters: { regionCode?: string; category?: string; limit?: number; cursor?: string }) {
    const limit = Math.min(Math.max(Number(filters.limit ?? 20), 1), 50);
    const where: Prisma.BoardPostWhereInput = { status: 'ACTIVE' };
    if (filters.regionCode) where.regionCode = filters.regionCode;
    if (filters.category) {
      const category = CATEGORIES[filters.category.toUpperCase()] ?? CATEGORIES[filters.category];
      if (!category) throw apiError(400, 'INVALID_CATEGORY', '게시판 카테고리를 확인해 주세요.');
      where.category = category;
    }
    const rows = await this.prisma.boardPost.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit * 3,
      ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
      include: { author: true, region: true },
    });
    const promoted = await this.promotions.activeTargetIds('POST');
    const items = rows.map((p) => this.serialize(p, userId, promoted.has(p.id) ? promoted.get(p.id) ?? null : null));
    items.sort((a, b) => {
      if (a.promoted !== b.promoted) return a.promoted ? -1 : 1;
      return Date.parse(b.createdAt) - Date.parse(a.createdAt);
    });
    return items.slice(0, limit);
  }

  private serialize(
    post: Prisma.BoardPostGetPayload<{ include: { author: true; region: true } }>,
    _userId: string,
    promotedUntil: Date | null,
  ) {
    return {
      id: post.id,
      category: post.category,
      title: post.title,
      body: post.body,
      excerpt: post.body.slice(0, 120),
      photoUrl: post.photoMediaId ? `/api/v1/media/${post.photoMediaId}` : null,
      regionCode: post.regionCode,
      regionName: post.region.name,
      author: publicProfile(post.author),
      likeCount: post.likeCount,
      commentCount: post.commentCount,
      bookmarkCount: post.bookmarkCount,
      promoted: Boolean(promotedUntil),
      promotedUntil: promotedUntil?.toISOString() ?? null,
      createdAt: post.createdAt.toISOString(),
    };
  }

  async create(userId: string, body: Record<string, unknown>) {
    const title = String(body.title ?? '').trim();
    if (title.length < 2 || title.length > 60) throw apiError(400, 'INVALID_TITLE', '제목은 2~60자로 입력해 주세요.');
    const content = String(body.body ?? '').trim();
    if (content.length < 2) throw apiError(400, 'INVALID_BODY', '내용을 입력해 주세요.');
    assertClean(`${title} ${content}`);
    const category = CATEGORIES[String(body.category ?? 'DAILY').toUpperCase()];
    if (!category) throw apiError(400, 'INVALID_CATEGORY', '카테고리를 선택해 주세요.');
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const regionCode = typeof body.regionCode === 'string' ? body.regionCode : user.regionCode;
    if (!regionCode) throw apiError(400, 'REGION_REQUIRED', '활동 지역을 먼저 설정해 주세요.');
    const post = await this.prisma.boardPost.create({
      data: {
        regionCode,
        category,
        authorId: userId,
        title,
        body: content,
        photoMediaId: typeof body.photoMediaId === 'string' ? body.photoMediaId : null,
      },
      include: { author: true, region: true },
    });
    return this.serialize(post, userId, null);
  }

  async detail(postId: string, userId: string) {
    const post = await this.prisma.boardPost.findUnique({
      where: { id: postId },
      include: {
        author: true,
        region: true,
        comments: {
          where: { status: 'ACTIVE' },
          orderBy: { createdAt: 'asc' },
          take: 200,
          include: { author: true },
        },
      },
    });
    if (!post || post.status === 'DELETED') throw apiError(404, 'POST_NOT_FOUND', '게시물을 찾을 수 없습니다.');
    const promoted = await this.promotions.activeTargetIds('POST');
    const [liked, bookmarked] = await Promise.all([
      this.prisma.postLike.findUnique({ where: { postId_userId: { postId, userId } } }),
      this.prisma.postBookmark.findUnique({ where: { postId_userId: { postId, userId } } }),
    ]);
    return {
      ...this.serialize(post, userId, promoted.get(post.id) ?? null),
      liked: Boolean(liked),
      bookmarked: Boolean(bookmarked),
      comments: post.comments.map((c) => ({
        id: c.id,
        body: c.body,
        author: publicProfile(c.author),
        createdAt: c.createdAt.toISOString(),
      })),
    };
  }

  async comment(postId: string, userId: string, body: string) {
    if (!body || body.trim().length === 0) throw apiError(400, 'EMPTY_COMMENT', '댓글 내용을 입력해 주세요.');
    assertClean(body);
    const post = await this.prisma.boardPost.findUnique({ where: { id: postId } });
    if (!post || post.status !== 'ACTIVE') throw apiError(404, 'POST_NOT_FOUND', '게시물을 찾을 수 없습니다.');
    const [comment] = await this.prisma.$transaction([
      this.prisma.postComment.create({ data: { postId, authorId: userId, body: body.trim().slice(0, 500) }, include: { author: true } }),
      this.prisma.boardPost.update({ where: { id: postId }, data: { commentCount: { increment: 1 } } }),
    ]);
    return {
      id: comment.id,
      body: comment.body,
      author: publicProfile(comment.author),
      createdAt: comment.createdAt.toISOString(),
    };
  }

  async toggleLike(postId: string, userId: string) {
    const existing = await this.prisma.postLike.findUnique({ where: { postId_userId: { postId, userId } } });
    if (existing) {
      await this.prisma.$transaction([
        this.prisma.postLike.delete({ where: { id: existing.id } }),
        this.prisma.boardPost.update({ where: { id: postId }, data: { likeCount: { decrement: 1 } } }),
      ]);
      return { liked: false };
    }
    await this.prisma.$transaction([
      this.prisma.postLike.create({ data: { postId, userId } }),
      this.prisma.boardPost.update({ where: { id: postId }, data: { likeCount: { increment: 1 } } }),
    ]);
    return { liked: true };
  }

  async toggleBookmark(postId: string, userId: string) {
    const existing = await this.prisma.postBookmark.findUnique({ where: { postId_userId: { postId, userId } } });
    if (existing) {
      await this.prisma.$transaction([
        this.prisma.postBookmark.delete({ where: { id: existing.id } }),
        this.prisma.boardPost.update({ where: { id: postId }, data: { bookmarkCount: { decrement: 1 } } }),
      ]);
      return { bookmarked: false };
    }
    await this.prisma.$transaction([
      this.prisma.postBookmark.create({ data: { postId, userId } }),
      this.prisma.boardPost.update({ where: { id: postId }, data: { bookmarkCount: { increment: 1 } } }),
    ]);
    return { bookmarked: true };
  }

  async remove(postId: string, userId: string) {
    const post = await this.prisma.boardPost.findUnique({ where: { id: postId } });
    if (!post) throw apiError(404, 'POST_NOT_FOUND', '게시물을 찾을 수 없습니다.');
    if (post.authorId !== userId) throw apiError(403, 'NOT_AUTHOR', '본인 게시물만 삭제할 수 있습니다.');
    await this.prisma.boardPost.update({ where: { id: postId }, data: { status: 'DELETED' } });
    return { deleted: true };
  }

  async promote(postId: string, userId: string, days: number) {
    const post = await this.prisma.boardPost.findUnique({ where: { id: postId } });
    if (!post || post.status === 'DELETED') throw apiError(404, 'POST_NOT_FOUND', '게시물을 찾을 수 없습니다.');
    return this.promotions.promote(userId, 'POST', postId, days, {
      authorId: post.authorId,
      status: post.status,
      regionCode: post.regionCode,
    });
  }
}
