import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../config/brand.dart';
import '../state/app_state.dart';
import 'chats/chats_screen.dart';
import 'groups/groups_screen.dart';
import 'my/my_screen.dart';
import 'nearby/nearby_screen.dart';
import 'neighborhood/neighborhood_screen.dart';

class HomeShell extends StatefulWidget {
  const HomeShell({super.key});

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  int _index = 0;

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final chatBadge = state.newRequestCount + state.unreadMessageCount;
    return Scaffold(
      body: IndexedStack(
        index: _index,
        children: const [
          NearbyScreen(),
          GroupsScreen(),
          NeighborhoodScreen(),
          ChatsScreen(),
          MyScreen(),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (value) => setState(() => _index = value),
        indicatorColor: const Color(Brand.primary).withValues(alpha: 0.12),
        destinations: [
          const NavigationDestination(
            icon: Icon(Icons.people_outline),
            selectedIcon: Icon(Icons.people),
            label: '주변',
          ),
          const NavigationDestination(
            icon: Icon(Icons.groups_outlined),
            selectedIcon: Icon(Icons.groups),
            label: '모임',
          ),
          const NavigationDestination(
            icon: Icon(Icons.storefront_outlined),
            selectedIcon: Icon(Icons.storefront),
            label: '동네',
          ),
          NavigationDestination(
            icon: Badge(
              isLabelVisible: chatBadge > 0,
              label: Text('$chatBadge'),
              child: const Icon(Icons.chat_bubble_outline),
            ),
            selectedIcon: Badge(
              isLabelVisible: chatBadge > 0,
              label: Text('$chatBadge'),
              child: const Icon(Icons.chat_bubble),
            ),
            label: '대화',
          ),
          const NavigationDestination(
            icon: Icon(Icons.person_outline),
            selectedIcon: Icon(Icons.person),
            label: '내정보',
          ),
        ],
      ),
    );
  }
}
