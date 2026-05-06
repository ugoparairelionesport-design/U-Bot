const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const configSystem = require('./configsystem');
let createCanvas, loadImage;
try {
  ({ createCanvas, loadImage } = require('@napi-rs/canvas'));
} catch (e) {
  console.error("⚠️ XP System: @napi-rs/canvas non trouvé, la génération de cartes de profil sera désactivée. Tapez 'npm install @napi-rs/canvas' dans le Shell Replit.");
}

class XPSystem {
  constructor(client) {
    this.client = client;
    console.log('📈 Système de Niveaux initialisé');
  }

  async handleMessage(message) {
    if (!message.guild || message.author.bot) return;
    
    const guildConfig = configSystem.getGuildConfig(message.guild.id);
    const settings = guildConfig.xp;
    if (!settings?.enabled) return;

    if (!settings.users) settings.users = {};
    const userData = settings.users[message.author.id] || { xp: 0, level: 0, prestige: 0, badges: [], lastMessage: 0 };

    const now = Date.now();
    const cooldownMs = (settings.cooldown || 60) * 1000;

    if (now - userData.lastMessage < cooldownMs) return;

    // Gain XP
    const [min, max] = settings.xpRange || [15, 25];
    const gain = Math.floor(Math.random() * (max - min + 1)) + min;
    
    userData.xp += gain;
    userData.lastMessage = now;

    // Level Up ?
    const xpNeeded = this.getXPForLevel(userData.level);
    if (userData.xp >= xpNeeded) {
      userData.level++;
      userData.xp -= xpNeeded;
      this.sendLevelUp(message, userData.level);
    }

    settings.users[message.author.id] = userData;
    configSystem.saveConfig(configSystem.getFullConfig());
  }

  getXPForLevel(level) {
    return (level + 1) * (level + 1) * 100;
  }

  async sendLevelUp(message, level) {
    const embed = new EmbedBuilder()
      .setTitle("🎊 LEVEL UP !")
      .setDescription(`Bravo ${message.author}, tu passes au niveau **${level}** !`)
      .setColor("#FFD700")
      .setTimestamp();
    
    await message.channel.send({ content: `${message.author}`, embeds: [embed] }).then(m => setTimeout(() => m.delete().catch(() => {}), 10000));
  }

  async generateProfileCard(member, guildConfig) {
    if (!createCanvas) return null;

    const userData = guildConfig.xp.users[member.id] || { xp: 0, level: 0, prestige: 0, badges: [] };
    const xpNeeded = this.getXPForLevel(userData.level);
    const progress = userData.xp / xpNeeded;

    const canvas = createCanvas(900, 300);
    const ctx = canvas.getContext('2d');

    // Fond
    ctx.fillStyle = '#1e1f22';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    if (guildConfig.globalEmbedBanner) {
        try {
            const bg = await loadImage(guildConfig.globalEmbedBanner);
            ctx.globalAlpha = 0.3;
            ctx.drawImage(bg, 0, 0, canvas.width, canvas.height);
            ctx.globalAlpha = 1.0;
        } catch(e) {}
    }

    // Avatar
    ctx.save();
    ctx.beginPath(); ctx.arc(150, 150, 100, 0, Math.PI * 2); ctx.closePath(); ctx.clip();
    const avatar = await loadImage(member.user.displayAvatarURL({ extension: 'png' }));
    ctx.drawImage(avatar, 50, 50, 200, 200);
    ctx.restore();

    // Pseudo et Level
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 40px sans-serif';
    ctx.fillText(member.user.username.toUpperCase(), 300, 100);
    
    ctx.font = '30px sans-serif';
    ctx.fillStyle = guildConfig.globalEmbedColor || '#5865f2';
    ctx.fillText(`LEVEL ${userData.level}`, 300, 150);
    if (userData.prestige > 0) ctx.fillText(`• PRESTIGE ${userData.prestige}`, 500, 150);

    // Barre d'XP
    ctx.fillStyle = '#444';
    ctx.roundRect(300, 200, 500, 30, 15);
    ctx.fill();

    ctx.fillStyle = guildConfig.globalEmbedColor || '#5865f2';
    ctx.roundRect(300, 200, 500 * progress, 30, 15);
    ctx.fill();

    // Texte XP
    ctx.fillStyle = '#ffffff';
    ctx.font = '20px sans-serif';
    ctx.fillText(`${userData.xp} / ${xpNeeded} XP`, 500, 222);

    return canvas.toBuffer();
  }

  async getLeaderboard(guild) {
    const guildConfig = configSystem.getGuildConfig(guild.id);
    const users = Object.entries(guildConfig.xp.users)
        .map(([id, data]) => ({ id, ...data }))
        .sort((a, b) => (b.prestige * 1000 + b.level) - (a.prestige * 1000 + a.level))
        .slice(0, 10);

    const embed = new EmbedBuilder()
        .setTitle(`🏆 Classement - ${guild.name}`)
        .setColor(guildConfig.globalEmbedColor)
        .setThumbnail(guild.iconURL());

    let description = "";
    for (let i = 0; i < users.length; i++) {
        const user = users[i];
        const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "👤";
        description += `${medal} **#${i+1}** <@${user.id}> • Niv. ${user.level} ${user.prestige > 0 ? `(P${user.prestige})` : ""}\n`;
    }

    embed.setDescription(description || "Aucune donnée enregistrée.");
    return embed;
  }
}

module.exports = XPSystem;