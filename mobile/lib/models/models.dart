/// 톡톡 Talk Talk 데이터 모델
library;

class AppUser {
  final String id;
  final String nickname;
  final String? photoUrl;
  final String? ageBand;
  final String? gender;
  final String? regionName;
  final String? regionCode;
  final List<String> interests;
  final String? bio;
  final String? distanceLabel;
  final String? lastActiveLabel;
  final String? activityLabel;
  final int? points;
  final Map<String, bool> settings;
  final String? status;
  final bool genderVisible;

  AppUser({
    required this.id,
    required this.nickname,
    this.photoUrl,
    this.ageBand,
    this.gender,
    this.regionName,
    this.regionCode,
    this.interests = const [],
    this.bio,
    this.distanceLabel,
    this.lastActiveLabel,
    this.activityLabel,
    this.points,
    this.settings = const {},
    this.status,
    this.genderVisible = false,
  });

  bool setting(String key, {bool fallback = true}) => settings[key] ?? fallback;

  factory AppUser.fromJson(Map<String, dynamic> json) {
    final settingsRaw = json['settings'];
    final settings = <String, bool>{};
    if (settingsRaw is Map) {
      settingsRaw.forEach((key, value) {
        if (value is bool) settings['$key'] = value;
      });
    }
    return AppUser(
      id: '${json['id']}',
      nickname: '${json['nickname'] ?? ''}',
      photoUrl: json['photoUrl'] as String?,
      ageBand: json['ageBand'] as String?,
      gender: json['gender'] as String?,
      regionName: json['regionName'] as String?,
      regionCode: json['regionCode'] as String?,
      interests:
          (json['interests'] as List?)?.map((e) => '$e').toList() ?? const [],
      bio: json['bio'] as String?,
      distanceLabel: json['distanceLabel'] as String?,
      lastActiveLabel:
          json['lastActiveLabel'] as String? ??
          json['activityLabel'] as String?,
      activityLabel: json['activityLabel'] as String?,
      points: json['points'] is int ? json['points'] as int : null,
      settings: settings,
      status: json['status'] as String?,
      genderVisible: json['genderVisible'] == true,
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'nickname': nickname,
    'photoUrl': photoUrl,
    'ageBand': ageBand,
    'gender': gender,
    'regionName': regionName,
    'regionCode': regionCode,
    'interests': interests,
    'bio': bio,
    'points': points,
    'settings': settings,
    'status': status,
  };
}

class Region {
  final String code;
  final String name;
  final String city;
  Region({required this.code, required this.name, required this.city});
  factory Region.fromJson(Map<String, dynamic> json) => Region(
    code: '${json['code']}',
    name: '${json['name']}',
    city: '${json['city'] ?? ''}',
  );
}

class ChatSummary {
  final String id;
  final String type;
  final String title;
  final String? imageUrl;
  final int memberCount;
  final ChatMessage? lastMessage;
  final int unreadCount;
  final bool muted;
  final String? lastMessageAt;

  ChatSummary({
    required this.id,
    required this.type,
    required this.title,
    this.imageUrl,
    this.memberCount = 0,
    this.lastMessage,
    this.unreadCount = 0,
    this.muted = false,
    this.lastMessageAt,
  });

  factory ChatSummary.fromJson(Map<String, dynamic> json) => ChatSummary(
    id: '${json['id']}',
    type: '${json['type']}',
    title: '${json['title']}',
    imageUrl: json['imageUrl'] as String?,
    memberCount: (json['memberCount'] as num?)?.toInt() ?? 0,
    lastMessage: json['lastMessage'] == null
        ? null
        : ChatMessage.fromJson(json['lastMessage'] as Map<String, dynamic>),
    unreadCount: (json['unreadCount'] as num?)?.toInt() ?? 0,
    muted: json['muted'] == true,
    lastMessageAt: json['lastMessageAt'] as String?,
  );
}

class ChatMessage {
  final String id;
  final String roomId;
  final String senderId;
  final String senderNickname;
  final String type;
  final String? body;
  final String? mediaId;
  final String? clientMessageId;
  final int seq;
  final DateTime createdAt;
  final bool masked;

  /// 전송 상태: sent(서버 확인) / pending(오프라인 큐) / failed
  final String state;

  ChatMessage({
    required this.id,
    required this.roomId,
    required this.senderId,
    required this.senderNickname,
    required this.type,
    this.body,
    this.mediaId,
    this.clientMessageId,
    this.seq = 0,
    required this.createdAt,
    this.masked = false,
    this.state = 'sent',
  });

  bool get isImage => type == 'IMAGE';

  ChatMessage copyWith({
    String? id,
    int? seq,
    String? state,
    bool? masked,
    String? body,
    String? mediaId,
  }) => ChatMessage(
    id: id ?? this.id,
    roomId: roomId,
    senderId: senderId,
    senderNickname: senderNickname,
    type: type,
    body: body ?? this.body,
    mediaId: mediaId ?? this.mediaId,
    clientMessageId: clientMessageId,
    seq: seq ?? this.seq,
    createdAt: createdAt,
    masked: masked ?? this.masked,
    state: state ?? this.state,
  );

  factory ChatMessage.fromJson(Map<String, dynamic> json) => ChatMessage(
    id: '${json['id']}',
    roomId: '${json['roomId']}',
    senderId: '${json['senderId']}',
    senderNickname: '${json['senderNickname'] ?? ''}',
    type: '${json['type'] ?? 'TEXT'}',
    body: json['body'] as String?,
    mediaId: json['mediaId'] as String?,
    clientMessageId: json['clientMessageId'] as String?,
    seq: int.tryParse('${json['seq']}') ?? 0,
    createdAt:
        DateTime.tryParse('${json['createdAt']}')?.toLocal() ?? DateTime.now(),
    masked: json['masked'] == true,
  );

  Map<String, dynamic> toJson() => {
    'id': id,
    'roomId': roomId,
    'senderId': senderId,
    'senderNickname': senderNickname,
    'type': type,
    'body': body,
    'mediaId': mediaId,
    'clientMessageId': clientMessageId,
    'seq': seq,
    'createdAt': createdAt.toIso8601String(),
    'masked': masked,
    'state': state,
  };
}

class NoteRequestItem {
  final String id;
  final String status;
  final String message;
  final String? roomId;
  final String createdAt;
  final Map<String, dynamic>? from;
  final Map<String, dynamic>? to;

  NoteRequestItem({
    required this.id,
    required this.status,
    required this.message,
    this.roomId,
    required this.createdAt,
    this.from,
    this.to,
  });

  String get counterpartName {
    final map = to ?? from;
    return '${map?['nickname'] ?? '이웃'}';
  }

  factory NoteRequestItem.fromJson(Map<String, dynamic> json) =>
      NoteRequestItem(
        id: '${json['id']}',
        status: '${json['status']}',
        message: '${json['message'] ?? ''}',
        roomId: json['roomId'] as String?,
        createdAt: '${json['createdAt'] ?? ''}',
        from: json['from'] as Map<String, dynamic>?,
        to: json['to'] as Map<String, dynamic>?,
      );
}

class CommunityRoom {
  final String id;
  final String type;
  final String title;
  final String? description;
  final String? imageUrl;
  final List<String> hashtags;
  final String? regionCode;
  final String? regionName;
  final int memberCount;
  final int? capacity;
  final bool joined;
  final String? myRole;
  final String? ownerId;
  final String visibility;
  final bool joinApproval;
  final bool banned;

  CommunityRoom({
    required this.id,
    required this.type,
    required this.title,
    this.description,
    this.imageUrl,
    this.hashtags = const [],
    this.regionCode,
    this.regionName,
    this.memberCount = 0,
    this.capacity,
    this.joined = false,
    this.myRole,
    this.ownerId,
    this.visibility = 'PUBLIC',
    this.joinApproval = false,
    this.banned = false,
  });

  bool get isFull => capacity != null && memberCount >= capacity!;
  bool get isOwner => myRole == 'OWNER';

  factory CommunityRoom.fromJson(Map<String, dynamic> json) => CommunityRoom(
    id: '${json['id']}',
    type: '${json['type']}',
    title: '${json['title']}',
    description: json['description'] as String?,
    imageUrl: json['imageUrl'] as String?,
    hashtags:
        (json['hashtags'] as List?)?.map((e) => '$e').toList() ?? const [],
    regionCode: json['regionCode'] as String?,
    regionName: json['regionName'] as String?,
    memberCount: (json['memberCount'] as num?)?.toInt() ?? 0,
    capacity: (json['capacity'] as num?)?.toInt(),
    joined: json['joined'] == true,
    myRole: json['myRole'] as String?,
    ownerId: json['ownerId'] as String?,
    visibility: '${json['visibility'] ?? 'PUBLIC'}',
    joinApproval: json['joinApproval'] == true,
    banned: json['banned'] == true,
  );
}

class BoardPost {
  final String id;
  final String category;
  final String title;
  final String body;
  final String? photoUrl;
  final String regionName;
  final String authorNickname;
  final String? authorPhoto;
  final int likeCount;
  final int commentCount;
  final bool promoted;
  final String createdAt;
  final bool liked;
  final bool bookmarked;

  BoardPost({
    required this.id,
    required this.category,
    required this.title,
    required this.body,
    this.photoUrl,
    this.regionName = '',
    this.authorNickname = '',
    this.authorPhoto,
    this.likeCount = 0,
    this.commentCount = 0,
    this.promoted = false,
    this.createdAt = '',
    this.liked = false,
    this.bookmarked = false,
  });

  factory BoardPost.fromJson(Map<String, dynamic> json) {
    final author = json['author'] as Map<String, dynamic>?;
    return BoardPost(
      id: '${json['id']}',
      category: '${json['category']}',
      title: '${json['title']}',
      body: '${json['body'] ?? ''}',
      photoUrl: json['photoUrl'] as String?,
      regionName: '${json['regionName'] ?? ''}',
      authorNickname: '${author?['nickname'] ?? ''}',
      authorPhoto: author?['photoUrl'] as String?,
      likeCount: (json['likeCount'] as num?)?.toInt() ?? 0,
      commentCount: (json['commentCount'] as num?)?.toInt() ?? 0,
      promoted: json['promoted'] == true,
      createdAt: '${json['createdAt'] ?? ''}',
      liked: json['liked'] == true,
      bookmarked: json['bookmarked'] == true,
    );
  }
}

class MarketItem {
  final String id;
  final String type;
  final String title;
  final String description;
  final int price;
  final String? photoUrl;
  final String regionName;
  final String status;
  final String sellerNickname;
  final bool promoted;

  MarketItem({
    required this.id,
    required this.type,
    required this.title,
    required this.description,
    required this.price,
    this.photoUrl,
    this.regionName = '',
    this.status = 'ON_SALE',
    this.sellerNickname = '',
    this.promoted = false,
  });

  String get priceLabel {
    if (type == 'FREE') return '무료 나눔';
    if (type == 'BUY') return '구매 희망 · ${price.toString()}원';
    return '${price.toString()}원';
  }

  String get statusLabel => switch (status) {
    'RESERVED' => '예약중',
    'SOLD' => '거래완료',
    _ => '판매중',
  };

  factory MarketItem.fromJson(Map<String, dynamic> json) {
    final seller = json['seller'] as Map<String, dynamic>?;
    return MarketItem(
      id: '${json['id']}',
      type: '${json['type']}',
      title: '${json['title']}',
      description: '${json['description'] ?? ''}',
      price: (json['price'] as num?)?.toInt() ?? 0,
      photoUrl: json['photoUrl'] as String?,
      regionName: '${json['regionName'] ?? ''}',
      status: '${json['status'] ?? 'ON_SALE'}',
      sellerNickname: '${seller?['nickname'] ?? ''}',
      promoted: json['promoted'] == true,
    );
  }
}

class PointProduct {
  final String productId;
  final String title;
  final int points;
  final int amount;
  final String type;
  PointProduct({
    required this.productId,
    required this.title,
    required this.points,
    required this.amount,
    required this.type,
  });
  factory PointProduct.fromJson(Map<String, dynamic> json) => PointProduct(
    productId: '${json['productId']}',
    title: '${json['title']}',
    points: (json['points'] as num?)?.toInt() ?? 0,
    amount: (json['amount'] as num?)?.toInt() ?? 0,
    type: '${json['type'] ?? 'POINTS'}',
  );
}
