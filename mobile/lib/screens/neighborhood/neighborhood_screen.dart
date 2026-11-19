import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../config/brand.dart';
import '../../state/app_state.dart';
import '../../widgets/common.dart';
import 'market_detail_screen.dart';
import 'post_detail_screen.dart';
import 'write_screens.dart';

class NeighborhoodScreen extends StatefulWidget {
  const NeighborhoodScreen({super.key});

  @override
  State<NeighborhoodScreen> createState() => _NeighborhoodScreenState();
}

class _NeighborhoodScreenState extends State<NeighborhoodScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tabController;
  String _category = 'DAILY';
  String _marketType = '';

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
    _tabController.addListener(() {
      if (!_tabController.indexIsChanging) setState(() {});
    });
    WidgetsBinding.instance.addPostFrameCallback((_) => _loadAll());
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  Future<void> _loadAll() async {
    final state = context.read<AppState>();
    try {
      await Future.wait([
        state.loadPosts(regionCode: state.me?.regionCode, category: _category),
        state.loadMarket(
          regionCode: state.me?.regionCode,
          type: _marketType.isEmpty ? null : _marketType,
        ),
      ]);
    } catch (e) {
      if (mounted) showError(context, e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final regionName = state.me?.regionName ?? '내 동네';
    return Scaffold(
      appBar: AppBar(
        title: Text('$regionName 동네'),
        bottom: TabBar(
          controller: _tabController,
          labelColor: const Color(Brand.primaryDark),
          indicatorColor: const Color(Brand.primary),
          tabs: const [
            Tab(text: '동네 게시판'),
            Tab(text: '장터'),
          ],
        ),
      ),
      floatingActionButton: FloatingActionButton(
        backgroundColor: const Color(Brand.primary),
        foregroundColor: Colors.white,
        onPressed: () async {
          if (_tabController.index == 0) {
            await Navigator.of(
              context,
            ).push(MaterialPageRoute(builder: (_) => const PostWriteScreen()));
          } else {
            await Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => const MarketWriteScreen()),
            );
          }
          await _loadAll();
        },
        child: const Icon(Icons.edit_outlined),
      ),
      body: TabBarView(
        controller: _tabController,
        children: [
          Column(
            children: [
              SizedBox(
                height: 46,
                child: ListView(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.symmetric(horizontal: 12),
                  children: [
                    for (final entry in const [
                      ('DAILY', '일상'),
                      ('QUESTION', '질문'),
                      ('HOBBY', '취미'),
                      ('GATHER', '모임모집'),
                    ])
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 4),
                        child: ChoiceChip(
                          label: Text(entry.$2),
                          selected: _category == entry.$1,
                          onSelected: (_) {
                            setState(() => _category = entry.$1);
                            state.loadPosts(
                              regionCode: state.me?.regionCode,
                              category: _category,
                            );
                          },
                        ),
                      ),
                  ],
                ),
              ),
              Expanded(
                child: state.posts.isEmpty
                    ? ListView(
                        children: const [
                          SizedBox(height: 60),
                          EmptyState(
                            icon: Icons.article_outlined,
                            title: '아직 게시글이 없어요',
                            subtitle: '동네 이웃에게 첫 글을 남겨 보세요.',
                          ),
                        ],
                      )
                    : RefreshIndicator(
                        onRefresh: _loadAll,
                        child: ListView.separated(
                          padding: const EdgeInsets.fromLTRB(16, 4, 16, 90),
                          itemCount: state.posts.length,
                          separatorBuilder: (_, __) =>
                              const SizedBox(height: 10),
                          itemBuilder: (context, index) {
                            final post = state.posts[index];
                            return InkWell(
                              onTap: () async {
                                await Navigator.of(context).push(
                                  MaterialPageRoute(
                                    builder: (_) =>
                                        PostDetailScreen(postId: post.id),
                                  ),
                                );
                                await _loadAll();
                              },
                              child: Container(
                                padding: const EdgeInsets.all(14),
                                decoration: BoxDecoration(
                                  color: Colors.white,
                                  borderRadius: BorderRadius.circular(14),
                                  border: Border.all(
                                    color: post.promoted
                                        ? const Color(Brand.accent)
                                        : Colors.grey.shade200,
                                  ),
                                ),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Row(
                                      children: [
                                        if (post.promoted)
                                          Container(
                                            margin: const EdgeInsets.only(
                                              right: 6,
                                            ),
                                            padding: const EdgeInsets.symmetric(
                                              horizontal: 6,
                                              vertical: 2,
                                            ),
                                            decoration: BoxDecoration(
                                              color: const Color(Brand.accent)
                                                  .withValues(alpha: 0.3),
                                              borderRadius:
                                                  BorderRadius.circular(6),
                                            ),
                                            child: const Text(
                                              '상단 고정',
                                              style: TextStyle(
                                                fontSize: 10,
                                                fontWeight: FontWeight.w800,
                                              ),
                                            ),
                                          ),
                                        Expanded(
                                          child: Text(
                                            post.title,
                                            maxLines: 1,
                                            overflow: TextOverflow.ellipsis,
                                            style: const TextStyle(
                                              fontWeight: FontWeight.w800,
                                              fontSize: 15,
                                            ),
                                          ),
                                        ),
                                      ],
                                    ),
                                    const SizedBox(height: 4),
                                    Text(
                                      post.body,
                                      maxLines: 2,
                                      overflow: TextOverflow.ellipsis,
                                      style: TextStyle(
                                        fontSize: 12.5,
                                        color: Colors.grey.shade700,
                                        height: 1.45,
                                      ),
                                    ),
                                    if (post.photoUrl != null) ...[
                                      const SizedBox(height: 8),
                                      ClipRRect(
                                        borderRadius: BorderRadius.circular(10),
                                        child: Image.network(
                                          state.api.absoluteMediaUrl(
                                            post.photoUrl,
                                          ),
                                          headers: {
                                            'authorization':
                                                'Bearer ${state.token ?? ''}',
                                          },
                                          height: 120,
                                          width: double.infinity,
                                          fit: BoxFit.cover,
                                          errorBuilder: (_, __, ___) =>
                                              const SizedBox.shrink(),
                                        ),
                                      ),
                                    ],
                                    const SizedBox(height: 8),
                                    Row(
                                      children: [
                                        Text(
                                          '${post.authorNickname} · ${post.regionName}',
                                          style: TextStyle(
                                            fontSize: 11,
                                            color: Colors.grey.shade500,
                                          ),
                                        ),
                                        const Spacer(),
                                        Icon(
                                          Icons.favorite_border,
                                          size: 13,
                                          color: Colors.grey.shade500,
                                        ),
                                        const SizedBox(width: 3),
                                        Text(
                                          '${post.likeCount}',
                                          style: TextStyle(
                                            fontSize: 11,
                                            color: Colors.grey.shade600,
                                          ),
                                        ),
                                        const SizedBox(width: 8),
                                        Icon(
                                          Icons.chat_bubble_outline,
                                          size: 13,
                                          color: Colors.grey.shade500,
                                        ),
                                        const SizedBox(width: 3),
                                        Text(
                                          '${post.commentCount}',
                                          style: TextStyle(
                                            fontSize: 11,
                                            color: Colors.grey.shade600,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ],
                                ),
                              ),
                            );
                          },
                        ),
                      ),
              ),
            ],
          ),
          Column(
            children: [
              SizedBox(
                height: 46,
                child: ListView(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.symmetric(horizontal: 12),
                  children: [
                    for (final entry in const [
                      ('', '전체'),
                      ('SELL', '판매'),
                      ('BUY', '구매'),
                      ('FREE', '무료나눔'),
                    ])
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 4),
                        child: ChoiceChip(
                          label: Text(entry.$2),
                          selected: _marketType == entry.$1,
                          onSelected: (_) {
                            setState(() => _marketType = entry.$1);
                            state.loadMarket(
                              regionCode: state.me?.regionCode,
                              type: _marketType.isEmpty ? null : _marketType,
                            );
                          },
                        ),
                      ),
                  ],
                ),
              ),
              Expanded(
                child: state.marketItems.isEmpty
                    ? ListView(
                        children: const [
                          SizedBox(height: 60),
                          EmptyState(
                            icon: Icons.storefront_outlined,
                            title: '아직 장터 글이 없어요',
                            subtitle: '안 쓰는 물건을 나눔하거나 판매해 볼까요?',
                          ),
                        ],
                      )
                    : RefreshIndicator(
                        onRefresh: _loadAll,
                        child: ListView.separated(
                          padding: const EdgeInsets.fromLTRB(16, 4, 16, 90),
                          itemCount: state.marketItems.length,
                          separatorBuilder: (_, __) =>
                              const SizedBox(height: 10),
                          itemBuilder: (context, index) {
                            final item = state.marketItems[index];
                            return InkWell(
                              onTap: () async {
                                await Navigator.of(context).push(
                                  MaterialPageRoute(
                                    builder: (_) =>
                                        MarketDetailScreen(itemId: item.id),
                                  ),
                                );
                                await _loadAll();
                              },
                              child: Container(
                                padding: const EdgeInsets.all(12),
                                decoration: BoxDecoration(
                                  color: Colors.white,
                                  borderRadius: BorderRadius.circular(14),
                                  border: Border.all(
                                    color: item.promoted
                                        ? const Color(Brand.accent)
                                        : Colors.grey.shade200,
                                  ),
                                ),
                                child: Row(
                                  children: [
                                    ClipRRect(
                                      borderRadius: BorderRadius.circular(10),
                                      child: item.photoUrl == null
                                          ? Container(
                                              width: 76,
                                              height: 76,
                                              color: Colors.grey.shade100,
                                              child: const Icon(
                                                Icons.image_outlined,
                                                color: Colors.grey,
                                              ),
                                            )
                                          : Image.network(
                                              state.api.absoluteMediaUrl(
                                                item.photoUrl,
                                              ),
                                              headers: {
                                                'authorization':
                                                    'Bearer ${state.token ?? ''}',
                                              },
                                              width: 76,
                                              height: 76,
                                              fit: BoxFit.cover,
                                              errorBuilder: (_, __, ___) =>
                                                  Container(
                                                    width: 76,
                                                    height: 76,
                                                    color: Colors.grey.shade100,
                                                  ),
                                            ),
                                    ),
                                    const SizedBox(width: 12),
                                    Expanded(
                                      child: Column(
                                        crossAxisAlignment:
                                            CrossAxisAlignment.start,
                                        children: [
                                          Row(
                                            children: [
                                              if (item.promoted)
                                                const Padding(
                                                  padding: EdgeInsets.only(
                                                    right: 4,
                                                  ),
                                                  child: Icon(
                                                    Icons.push_pin,
                                                    size: 12,
                                                    color: Color(
                                                      Brand.primaryDark,
                                                    ),
                                                  ),
                                                ),
                                              Expanded(
                                                child: Text(
                                                  item.title,
                                                  maxLines: 1,
                                                  overflow:
                                                      TextOverflow.ellipsis,
                                                  style: const TextStyle(
                                                    fontWeight: FontWeight.w700,
                                                  ),
                                                ),
                                              ),
                                            ],
                                          ),
                                          Text(
                                            item.description,
                                            maxLines: 1,
                                            overflow: TextOverflow.ellipsis,
                                            style: TextStyle(
                                              fontSize: 12,
                                              color: Colors.grey.shade600,
                                            ),
                                          ),
                                          const SizedBox(height: 4),
                                          Row(
                                            children: [
                                              Text(
                                                item.priceLabel,
                                                style: const TextStyle(
                                                  fontWeight: FontWeight.w800,
                                                  fontSize: 13,
                                                ),
                                              ),
                                              const SizedBox(width: 6),
                                              if (item.status != 'ON_SALE')
                                                Container(
                                                  padding:
                                                      const EdgeInsets.symmetric(
                                                        horizontal: 5,
                                                        vertical: 1,
                                                      ),
                                                  decoration: BoxDecoration(
                                                    color: Colors.grey.shade200,
                                                    borderRadius:
                                                        BorderRadius.circular(
                                                          4,
                                                        ),
                                                  ),
                                                  child: Text(
                                                    item.statusLabel,
                                                    style: const TextStyle(
                                                      fontSize: 10,
                                                    ),
                                                  ),
                                                ),
                                            ],
                                          ),
                                          Text(
                                            '${item.regionName} · ${item.sellerNickname}',
                                            style: TextStyle(
                                              fontSize: 11,
                                              color: Colors.grey.shade500,
                                            ),
                                          ),
                                        ],
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            );
                          },
                        ),
                      ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
