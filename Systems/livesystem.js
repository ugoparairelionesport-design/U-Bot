const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const configSystem = require('./configsystem');
const { fetch } = require('undici');

class LiveSystem {
  constructor(client) {
    this.client = client;
    this.checkInterval = 30 * 1000;
    this.twitchToken = null;
    this.twitchTokenExpires = 0;
    this.cache = new Map();
    this.init();
  }

  init() {
    setInterval(() => this.checkAllLives().catch(err => console.error('LiveSystem Loop Error:', err)), this.checkInterval);
    console.log('LiveSystem initialise');
  }

  cleanUrl(url) {
    return String(url || '').replace(/<|>/g, '').trim();
  }

  async checkAllLives() {
    console.log(`[LIVE] Verification en cours pour ${this.client.guilds.cache.size} serveur(s)...`);
    const checks = [];
    let hasChanged = false;

    for (const [guildId, guild] of this.client.guilds.cache) {
      const guildConfig = configSystem.getGuildConfig(guildId);
      if (!guildConfig.liveConfigs?.length) continue;

      for (const live of guildConfig.liveConfigs) {
        checks.push(this.processLiveCheck(guild, live).then(changed => {
          if (changed) hasChanged = true;
        }));
      }
    }

    await Promise.allSettled(checks);
    if (hasChanged) configSystem.saveConfig(configSystem.getFullConfig());
  }

  async processLiveCheck(guild, live) {
    const status = await this.fetchLiveStatus(live.platform, live.url, guild).catch(() => null);
    let liveTitle = status?.title || null;
    const guildConfig = configSystem.getGuildConfig(guild.id);

    if (liveTitle) {
      console.log(`[LIVE] Detecte pour ${live.url} | Titre: "${liveTitle}"`);
    }

    const hashtag = live.securityHashtag || guildConfig.securityHashtag;
    if (liveTitle && hashtag) {
      const cleanTitle = liveTitle.toLowerCase();
      const cleanHashtag = hashtag.toLowerCase().trim();

      if (!cleanTitle.includes(cleanHashtag)) {
        console.log(`[LIVE] Ignore pour ${live.url}: hashtag "${cleanHashtag}" absent.`);
        liveTitle = null;
      }
    }

    if (liveTitle && !live.isLive) {
      live.tempInfo = status;
      await this.sendLiveNotification(guild, live, liveTitle);
      return true;
    }

    if (!liveTitle && live.isLive) {
      console.log(`[LIVE] Fin de live detectee pour ${live.url}.`);
      await this.cleanupLiveNotification(guild, live);
      return true;
    }

    return false;
  }

  async getTwitchToken() {
    if (this.twitchToken && Date.now() < this.twitchTokenExpires) return this.twitchToken;

    const clientID = process.env.TWITCH_CLIENT_ID;
    const clientSecret = process.env.TWITCH_CLIENT_SECRET;
    if (!clientID || !clientSecret) return null;

    const res = await fetch(`https://id.twitch.tv/oauth2/token?client_id=${clientID}&client_secret=${clientSecret}&grant_type=client_credentials`, { method: 'POST' });
    const data = await res.json();

    this.twitchToken = data.access_token;
    this.twitchTokenExpires = Date.now() + (data.expires_in * 1000) - 60000;
    return this.twitchToken;
  }

  async checkTwitch(url) {
    const token = await this.getTwitchToken();
    const clientID = process.env.TWITCH_CLIENT_ID;
    if (!token || !clientID) return null;

    const cleanUrl = this.cleanUrl(url);
    const username = cleanUrl.includes('/') ? cleanUrl.split('/').filter(Boolean).pop() : cleanUrl.replace('@', '');
    if (!username) return null;

    if (!this.cache.has(`twitch_user_${username}`)) {
      const userRes = await fetch(`https://api.twitch.tv/helix/users?login=${username}`, {
        headers: { 'Client-ID': clientID, Authorization: `Bearer ${token}` }
      });
      const userData = await userRes.json();
      if (userData?.data?.[0]) this.cache.set(`twitch_user_${username}`, userData.data[0]);
    }

    const res = await fetch(`https://api.twitch.tv/helix/streams?user_login=${username}`, {
      headers: { 'Client-ID': clientID, Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    const stream = data?.data?.[0];
    if (!stream) return null;

    const user = this.cache.get(`twitch_user_${username}`) || {};
    return {
      title: stream.title,
      displayName: stream.user_name || user.display_name || username,
      avatar: user.profile_image_url || null,
      thumbnail: stream.thumbnail_url?.replace('{width}', '1280').replace('{height}', '720'),
      viewers: stream.viewer_count || null,
      category: stream.game_name || null,
      url: `https://www.twitch.tv/${username}`
    };
  }

  async checkYouTube(url) {
    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey) return null;

    const cleanUrl = this.cleanUrl(url);
    const handleMatch = cleanUrl.match(/@([^/?#]+)/);
    let channelId = null;

    if (handleMatch) {
      const handle = handleMatch[1];
      if (!this.cache.has(`yt_id_${handle}`)) {
        const resolve = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(handle)}&type=channel&maxResults=1&key=${apiKey}`);
        const resolved = await resolve.json();
        if (resolved.items?.[0]) this.cache.set(`yt_id_${handle}`, resolved.items[0].id.channelId);
      }
      channelId = this.cache.get(`yt_id_${handle}`);
    } else {
      channelId = cleanUrl.split('/').filter(Boolean).pop();
    }

    if (!channelId) return null;
    const res = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&type=video&eventType=live&maxResults=1&key=${apiKey}`);
    const data = await res.json();
    const item = data?.items?.[0];
    if (!item) return null;

    const videoUrl = item.id?.videoId ? `https://www.youtube.com/watch?v=${item.id.videoId}` : cleanUrl;
    return {
      title: item.snippet.title,
      displayName: item.snippet.channelTitle,
      avatar: item.snippet.thumbnails?.default?.url || item.snippet.thumbnails?.high?.url || null,
      thumbnail: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.medium?.url || null,
      url: videoUrl
    };
  }

  async checkTikTok(url, guild) {
    const cleanUrl = this.cleanUrl(url);

    if (cleanUrl.includes('test-live')) {
      const guildConfig = configSystem.getGuildConfig(guild.id);
      return {
        title: `LIVE DE TEST ${guildConfig?.securityHashtag || ''} - Rejoignez l'aventure !`,
        displayName: 'Test Live Account',
        avatar: guild.iconURL({ dynamic: true }) || null,
        thumbnail: guildConfig.globalEmbedBanner || null,
        url: cleanUrl
      };
    }

    try {
      const match = cleanUrl.match(/@([^/?#]+)/);
      const username = match ? match[1] : cleanUrl.split('/').filter(Boolean).pop()?.replace('@', '');
      if (!username) return null;

      const liveUrl = `https://www.tiktok.com/@${username}/live`;
      const res = await fetch(liveUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'
        }
      });

      if (!res.ok) return null;
      const html = await res.text();
      const isLive = html.includes('"room_id":') && !html.includes('"live_status":0');
      if (!isLive) return null;

      const stateMatch = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application\/json">([\s\S]*?)<\/script>/);
      if (stateMatch) {
        const jsonData = JSON.parse(stateMatch[1]);
        const scope = jsonData?.__DEFAULT_SCOPE__?.['webapp.user-detail'];
        const liveData = scope?.liveRoom;
        const userData = scope?.userInfo?.user;
        const cover = liveData?.cover?.urlList?.[0] || liveData?.cover?.url_list?.[0] || null;

        return {
          title: liveData?.title || 'En direct sur TikTok',
          displayName: userData?.nickname || username,
          avatar: userData?.avatarLarger || userData?.avatarMedium || null,
          thumbnail: cover,
          url: liveUrl
        };
      }

      return { title: 'En direct sur TikTok', displayName: username, avatar: null, thumbnail: null, url: liveUrl };
    } catch (_) {
      return null;
    }
  }

  async fetchLiveStatus(platform, url, guild) {
    try {
      if (platform === 'twitch') return await this.checkTwitch(url);
      if (platform === 'youtube') return await this.checkYouTube(url);
      if (platform === 'tiktok') return await this.checkTikTok(url, guild);
      return null;
    } catch (err) {
      console.error(`Erreur check ${platform}:`, err.message);
      return null;
    }
  }

  async sendLiveNotification(guild, live, liveTitle) {
    if (!live.channelId) {
      console.error(`[LIVE] Aucun salon de destination configure pour ${live.url}`);
      return;
    }

    const channel = await guild.channels.fetch(live.channelId).catch(() => null);
    if (!channel || !channel.isTextBased()) return;

    const platformData = {
      twitch: { color: '#9146FF', name: 'Twitch', emoji: '🟣', icon: 'https://static.twitchcdn.net/assets/favicon-32-e29e246c157142c94346.png' },
      youtube: { color: '#FF0033', name: 'YouTube', emoji: '🔴', icon: 'https://www.youtube.com/favicon.ico' },
      tiktok: { color: '#00F2EA', name: 'TikTok', emoji: '⚡', icon: 'https://www.tiktok.com/favicon.ico' }
    };

    const data = platformData[live.platform] || platformData.twitch;
    const info = live.tempInfo || {};
    const targetUrl = this.cleanUrl(info.url || live.url);
    const displayName = info.displayName || targetUrl.split('/').filter(Boolean).pop()?.replace('@', '') || 'Createur';
    const profilePic = info.avatar || data.icon;
    const previewImage = info.thumbnail || null;
    const viewerText = info.viewers ? `${info.viewers.toLocaleString('fr-FR')} viewers` : 'En direct';
    const categoryText = info.category || data.name;

    const embed = new EmbedBuilder()
      .setAuthor({ name: `${displayName} est en live`, iconURL: profilePic })
      .setTitle(`${data.emoji} ${liveTitle || `Direct en cours sur ${data.name}`}`)
      .setURL(targetUrl)
      .setDescription('Le live vient de commencer. La miniature ci-dessous provient directement de la plateforme quand elle est disponible.')
      .addFields(
        { name: 'Plateforme', value: `\`${data.name}\``, inline: true },
        { name: 'Statut', value: `\`${viewerText}\``, inline: true },
        { name: 'Categorie', value: `\`${categoryText}\``, inline: true },
        { name: 'Lien direct', value: `[Ouvrir le live](${targetUrl})`, inline: false }
      )
      .setColor(data.color)
      .setThumbnail(profilePic)
      .setFooter({ text: `U-Bot Live • ${data.name}`, iconURL: data.icon })
      .setTimestamp();

    if (previewImage) embed.setImage(previewImage);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel(`Ouvrir sur ${data.name}`)
        .setURL(targetUrl)
        .setStyle(ButtonStyle.Link)
    );

    const mention = live.roleId ? `<@&${live.roleId}>` : '';
    const content = `${mention}${mention ? '\n' : ''}🔥 **Nouveau live detecte !**\n${targetUrl}`;
    const message = await channel.send({
      content,
      embeds: [embed],
      components: [row],
      allowedMentions: live.roleId ? { roles: [live.roleId] } : { parse: [] }
    }).catch(() => null);

    if (message) {
      live.isLive = true;
      live.lastMessageId = message.id;
      console.log(`[LIVE] Notification envoyee pour ${targetUrl} dans #${channel.name}`);
    }
  }

  async cleanupLiveNotification(guild, live) {
    const channel = await guild.channels.fetch(live.channelId).catch(() => null);
    if (channel?.isTextBased() && live.lastMessageId) {
      const message = await channel.messages.fetch(live.lastMessageId).catch(() => null);
      if (message) await message.delete().catch(() => {});
    }

    live.isLive = false;
    live.lastMessageId = null;
    live.tempInfo = null;
  }
}

module.exports = LiveSystem;
