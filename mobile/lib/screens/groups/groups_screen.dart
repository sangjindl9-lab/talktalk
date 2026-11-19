import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../config/brand.dart';
import '../../models/models.dart';
import '../../state/app_state.dart';
import '../../widgets/common.dart';
import 'group_create_screen.dart';
import 'group_detail_screen.dart';

class GroupsScreen extends StatefulWidget {
  const GroupsScreen({super.key});

  @override
  State<GroupsScreen> createState() => _GroupsScreenState();
}

class _GroupsScreenState extends State<GroupsScreen> {
  String _tab = 'all';
  final _search = TextEditingController();
  bool _loading = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      await context.read<AppState>().loadRooms(
        q: _search.text.trim().isEmpty ? null : _search.text.trim(),
        type: _tab == 'region' ? 'REGION' : (_tab == 'group' ? 'GROUP' : null),
        mine: _tab == 'mine',
      );
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _join(CommunityRoom room) async {
    final state = context.read<AppState>();
    try {
      final result = await state.joinCommunityRoom(room.id);
      if (!mounted) return;
      if (result['pending'] == true) {
        showInfo(context, '가입 승인 요청을 보냈습니다. 방장의 승인을 기다려 주세요.');
      } else if (result['roomId'] != null) {
        Navigator.of(context).push(
          MaterialPageRoute(builder: (_) => GroupDetailScreen(roomId: room.id)),
        );
      }
    } catch (e) {
      if (mounted) showError(context, e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final meRole = state.me?.regionName;
    return Scaffold(
      appBar: AppBar(title: const Text('모임')),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () async {
          await Navigator.of(
            context,
          ).push(MaterialPageRoute(builder: (_) => const GroupCreateScreen()));
          await _load();
        },
        backgroundColor: const Color(Brand.primary),
        foregroundColor: Colors.white,
        icon: const Icon(Icons.add),
        label: const Text('방 만들기'),
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 10, 16, 4),
            child: TextField(
              controller: _search,
              textInputAction: TextInputAction.search,
              onSubmitted: (_) => _load(),
              decoration: InputDecoration(
                hintText: '관심사·지역방 검색',
                prefixIcon: const Icon(Icons.search, size: 20),
                suffixIcon: IconButton(
                  icon: const Icon(Icons.arrow_forward, size: 18),
                  onPressed: _load,
                ),
              ),
            ),
          ),
          SizedBox(
            height: 46,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 12),
              children: [
                for (final entry in const [
                  ('all', '전체'),
                  ('mine', '내 방'),
                  ('region', '지역방'),
                  ('group', '관심사·그룹'),
                ])
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 4),
                    child: ChoiceChip(
                      label: Text(entry.$2),
                      selected: _tab == entry.$1,
                      onSelected: (_) {
                        setState(() => _tab = entry.$1);
                        _load();
                      },
                    ),
                  ),
              ],
            ),
          ),
          if (meRole != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 0),
              child: Row(
                children: [
                  Icon(Icons.place, size: 14, color: Colors.grey.shade500),
                  const SizedBox(width: 4),
                  Text(
                    '$meRole 지역방',
                    style: TextStyle(
                      fontSize: 11.5,
                      color: Colors.grey.shade600,
                    ),
                  ),
                  const Spacer(),
                  TextButton(
                    onPressed: () async {
                      try {
                        final result = await state.joinRegionRoom(
                          state.me!.regionCode!,
                        );
                        if (mounted && result['roomId'] != null) {
                          Navigator.of(context).push(
                            MaterialPageRoute(
                              builder: (_) => GroupDetailScreen(
                                roomId: '${result['roomId']}',
                              ),
                            ),
                          );
                        }
                      } catch (e) {
                        if (mounted) showError(context, e);
                      }
                    },
                    child: const Text(
                      '내 지역방 들어가기',
                      style: TextStyle(fontSize: 11.5),
                    ),
                  ),
                ],
              ),
            ),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : state.rooms.isEmpty
                ? ListView(
                    children: const [
                      SizedBox(height: 60),
                      EmptyState(
                        icon: Icons.groups_outlined,
                        title: '아직 참여할 방이 없어요',
                        subtitle: '관심사가 맞는 방을 만들거나 지역방에 참여해 보세요.',
                      ),
                    ],
                  )
                : RefreshIndicator(
                    onRefresh: _load,
                    child: ListView.separated(
                      padding: const EdgeInsets.fromLTRB(16, 8, 16, 90),
                      itemCount: state.rooms.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 10),
                      itemBuilder: (context, index) {
                        final room = state.rooms[index];
                        return Container(
                          decoration: BoxDecoration(
                            color: Colors.white,
                            borderRadius: BorderRadius.circular(16),
                            border: Border.all(color: Colors.grey.shade200),
                          ),
                          child: InkWell(
                            borderRadius: BorderRadius.circular(16),
                            onTap: () async {
                              await Navigator.of(context).push(
                                MaterialPageRoute(
                                  builder: (_) =>
                                      GroupDetailScreen(roomId: room.id),
                                ),
                              );
                              await _load();
                            },
                            child: Padding(
                              padding: const EdgeInsets.all(14),
                              child: Row(
                                children: [
                                  UserAvatar(
                                    url: room.imageUrl,
                                    nickname: room.title,
                                    size: 52,
                                  ),
                                  const SizedBox(width: 12),
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        Row(
                                          children: [
                                            Flexible(
                                              child: Text(
                                                room.title,
                                                overflow: TextOverflow.ellipsis,
                                                style: const TextStyle(
                                                  fontWeight: FontWeight.w800,
                                                  fontSize: 15,
                                                ),
                                              ),
                                            ),
                                            if (room.type == 'REGION')
                                              const Padding(
                                                padding: EdgeInsets.only(
                                                  left: 6,
                                                ),
                                                child: Icon(
                                                  Icons.place,
                                                  size: 13,
                                                  color: Color(Brand.primary),
                                                ),
                                              ),
                                            if (room.visibility == 'PRIVATE')
                                              const Padding(
                                                padding: EdgeInsets.only(
                                                  left: 4,
                                                ),
                                                child: Icon(
                                                  Icons.lock_outline,
                                                  size: 13,
                                                ),
                                              ),
                                          ],
                                        ),
                                        if (room.description != null)
                                          Text(
                                            room.description!,
                                            maxLines: 1,
                                            overflow: TextOverflow.ellipsis,
                                            style: TextStyle(
                                              fontSize: 12,
                                              color: Colors.grey.shade600,
                                            ),
                                          ),
                                        const SizedBox(height: 4),
                                        Text(
                                          '${room.memberCount}${room.capacity != null ? ' / ${room.capacity}' : ''}명'
                                          '${room.hashtags.isEmpty ? '' : ' · ${room.hashtags.take(3).map((e) => '#$e').join(' ')}'}',
                                          style: TextStyle(
                                            fontSize: 11,
                                            color: Colors.grey.shade500,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                  if (!room.joined)
                                    SizedBox(
                                      width: 74,
                                      child: FilledButton.tonal(
                                        onPressed: room.isFull
                                            ? null
                                            : () => _join(room),
                                        style: FilledButton.styleFrom(
                                          minimumSize: const Size(0, 36),
                                          padding: EdgeInsets.zero,
                                        ),
                                        child: Text(
                                          room.isFull ? '정원' : '참여',
                                          style: const TextStyle(fontSize: 12),
                                        ),
                                      ),
                                    )
                                  else
                                    const Icon(
                                      Icons.check_circle,
                                      color: Color(Brand.primary),
                                      size: 20,
                                    ),
                                ],
                              ),
                            ),
                          ),
                        );
                      },
                    ),
                  ),
          ),
        ],
      ),
    );
  }
}
