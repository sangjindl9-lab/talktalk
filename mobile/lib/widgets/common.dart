import 'package:flutter/material.dart';

import '../config/brand.dart';
import '../models/models.dart';

class UserAvatar extends StatelessWidget {
  const UserAvatar({super.key, this.url, this.size = 48, this.nickname});

  final String? url;
  final double size;
  final String? nickname;

  @override
  Widget build(BuildContext context) {
    final fallback = Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: const Color(Brand.primary).withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(size / 3),
      ),
      alignment: Alignment.center,
      child: Text(
        (nickname == null || nickname!.isEmpty) ? '톡' : nickname!.characters.first,
        style: TextStyle(fontSize: size * 0.36, fontWeight: FontWeight.w800, color: const Color(Brand.primaryDark)),
      ),
    );
    if (url == null || url!.isEmpty) return fallback;
    return ClipRRect(
      borderRadius: BorderRadius.circular(size / 3),
      child: Image.network(
        url!,
        width: size,
        height: size,
        fit: BoxFit.cover,
        errorBuilder: (_, __, ___) => fallback,
      ),
    );
  }
}

class DistanceChip extends StatelessWidget {
  const DistanceChip({super.key, required this.label});
  final String? label;

  @override
  Widget build(BuildContext context) {
    if (label == null) return const SizedBox.shrink();
    final color = switch (label) {
      '같은 동네' => const Color(0xFF1F9254),
      '가까운 지역' => const Color(0xFFB7791F),
      _ => const Color(0xFF6B6F76),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(label!, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: color)),
    );
  }
}

class SectionTitle extends StatelessWidget {
  const SectionTitle(this.title, {super.key, this.trailing});
  final String title;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(4, 18, 4, 8),
      child: Row(
        children: [
          Text(title, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800)),
          const Spacer(),
          if (trailing != null) trailing!,
        ],
      ),
    );
  }
}

class EmptyState extends StatelessWidget {
  const EmptyState({super.key, required this.icon, required this.title, this.subtitle, this.action});
  final IconData icon;
  final String title;
  final String? subtitle;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 48, color: Colors.grey.shade400),
            const SizedBox(height: 12),
            Text(title, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
            if (subtitle != null) ...[
              const SizedBox(height: 6),
              Text(subtitle!, textAlign: TextAlign.center, style: TextStyle(color: Colors.grey.shade600, fontSize: 13)),
            ],
            if (action != null) ...[const SizedBox(height: 16), action!],
          ],
        ),
      ),
    );
  }
}

class UserListTile extends StatelessWidget {
  const UserListTile({
    super.key,
    required this.user,
    this.onTap,
    this.trailing,
    this.subtitleLines = 2,
  });

  final AppUser user;
  final VoidCallback? onTap;
  final Widget? trailing;
  final int subtitleLines;

  @override
  Widget build(BuildContext context) {
    final details = <String>[
      if (user.ageBand != null) user.ageBand!,
      if (user.regionName != null) user.regionName!,
      if (user.lastActiveLabel != null) user.lastActiveLabel!,
    ];
    return ListTile(
      onTap: onTap,
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
      leading: UserAvatar(url: user.photoUrl, nickname: user.nickname, size: 50),
      title: Row(
        children: [
          Flexible(child: Text(user.nickname, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700))),
          const SizedBox(width: 6),
          DistanceChip(label: user.distanceLabel ?? user.lastActiveLabel),
        ],
      ),
      subtitle: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (details.isNotEmpty)
            Text(details.join(' · '), maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12)),
          if (user.bio != null && user.bio!.isNotEmpty)
            Text(user.bio!, maxLines: subtitleLines, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12)),
          if (user.interests.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 3),
              child: Text(
                user.interests.take(4).map((e) => '#$e').join(' '),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: 11, color: Colors.grey.shade600),
              ),
            ),
        ],
      ),
      trailing: trailing,
    );
  }
}

void showError(BuildContext context, Object error) {
  final message = error is Exception ? error.toString().replaceFirst('Exception: ', '') : '$error';
  ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
}

void showInfo(BuildContext context, String message) {
  ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
}
