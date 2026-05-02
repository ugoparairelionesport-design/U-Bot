const { EmbedBuilder, PermissionsBitField, Events } = require('discord.js');
const configSystem = require('./configsystem');

class AntiRaidSystem {
  constructor(client) {
    this.client = client;
    this.joinCache = new Map(); // guildId -> [timestamps]
    this.invitesCache = new Map(); // guildId -> Map(code -> uses)
    this.raidParticipants = new Map(); // guildId -> Set(userIds)
    console.log('🛡️ Système Anti-Raid initialisé');
    
    // On charge les invitations initiales pour le tracking
    this.initializeInviteTracking();
  }

  async initializeInviteTracking() {
    for (const [guildId, guild] of this.client.guilds.cache) {
      try {
        const invites = await guild.invites.fetch();
        const guildInvites = new Map();
        invites.forEach(inv => guildInvites.set(inv.code, inv.uses));
        this.invitesCache.set(guildId, guildInvites);
      } catch (e) {
        console.warn(`⚠️ Impossible de lire les invites pour ${guild.name}`);
      }
    }
  }

  async handleMemberJoin(member) {
    const guild = member.guild;
    const guildConfig = configSystem.getGuildConfig(guild.id);
    const settings = guildConfig.antiRaid;

    if (!settings?.enabled) return;

    const now = Date.now();
    let trustScore = 100;
    let reasons = [];

    // --- ANALYSE DE L'INVITATION ---
    const usedInvite = await this.findUsedInvite(guild);
    
    // 1. Âge du compte
    const accountAgeHours = (now - member.user.createdTimestamp) / (1000 * 60 * 60);
    if (accountAgeHours < (settings.minAge || 24)) {
      trustScore -= 60;
      reasons.push("Compte trop récent");
    }

    // 2. Absence d'avatar
    if (!member.user.avatar) {
      trustScore -= 20;
      reasons.push("Pas d'avatar");
    }

    // 3. Détection de flux (Raid)
    let timestamps = this.joinCache.get(guild.id) || [];
    const windowMs = (settings.window || 10) * 1000;
    timestamps = timestamps.filter(t => now - t < windowMs);
    timestamps.push(now);
    this.joinCache.set(guild.id, timestamps);

    if (timestamps.length >= (settings.threshold || 5)) {
      trustScore -= 100;
      reasons.push("Flux d'entrées massif");
      if (!settings.lockdown) await this.triggerLockdown(guild, usedInvite);
    }

    // --- ACTION ---
    if (trustScore <= 0 || settings.lockdown) {
      const action = settings.lockdown ? "Mode Lockdown" : "Trust Score trop bas";
      await this.logAction(guild, member.user, `${action} (${reasons.join(', ')})`, usedInvite);
      
      // Stockage pour purge future
      if (!this.raidParticipants.has(guild.id)) this.raidParticipants.set(guild.id, new Set());
      this.raidParticipants.get(guild.id).add(member.id);

      return member.kick(`Anti-Raid Professional: ${reasons.join(' | ')}`).catch(() => {});
    }
  }

  async findUsedInvite(guild) {
    try {
      const cachedInvites = this.invitesCache.get(guild.id);
      const currentInvites = await guild.invites.fetch();
      
      let usedInvite = null;
      for (const [code, inv] of currentInvites) {
        const prevUses = cachedInvites?.get(code) || 0;
        if (inv.uses > prevUses) {
          usedInvite = inv;
          break;
        }
      }
      // Update cache
      const newCache = new Map();
      currentInvites.forEach(inv => newCache.set(inv.code, inv.uses));
      this.invitesCache.set(guild.id, newCache);
      return usedInvite;
    } catch (e) { return null; }
  }

  async triggerLockdown(guild, invite = null) {
    const guildConfig = configSystem.getGuildConfig(guild.id);
    guildConfig.antiRaid.lockdown = true;
    configSystem.saveConfig(configSystem.getFullConfig());

    const embed = new EmbedBuilder()
      .setTitle('🚨 ALERTE ANTI-RAID 🚨')
      .setDescription(`Une activité suspecte a été détectée. Le serveur est passé en **Mode Lockdown**.\n\n${invite ? `📍 Vecteur probable : Invite \`${invite.code}\` (Créée par ${invite.inviter?.tag || 'Inconnu'})` : ''}`)
      .setColor('#FF0000')
      .addFields({ name: 'Action', value: 'Toutes les nouvelles entrées sont bloquées.' })
      .setTimestamp();

    await configSystem.sendLog(guild, embed, guildConfig.antiRaid.logChannel);

    // Optionnel : Suppression automatique du lien d'invite compromis
    if (invite && invite.deletable) {
        await invite.delete("Anti-Raid: Vecteur de raid détecté").catch(() => {});
    }
  }

  async logAction(guild, user, reason, invite = null) {
    const guildConfig = configSystem.getGuildConfig(guild.id);
    const embed = new EmbedBuilder()
      .setTitle('🛡️ Action Anti-Raid')
      .setThumbnail(user.displayAvatarURL())
      .addFields(
        { name: 'Utilisateur', value: `${user.tag} (${user.id})`, inline: true },
        { name: 'Raison', value: `\`${reason}\``, inline: true },
        { name: 'Vecteur', value: invite ? `Invite: \`${invite.code}\`` : 'Inconnu', inline: true }
      )
      .setColor(reason.includes('Lockdown') ? '#000000' : '#FFA500')
      .setTimestamp();

    await configSystem.sendLog(guild, embed, guildConfig.antiRaid.logChannel);
  }

  async toggleLockdown(interaction) {
    const guildConfig = configSystem.getGuildConfig(interaction.guildId);
    const currentState = guildConfig.antiRaid.lockdown;
    guildConfig.antiRaid.lockdown = !currentState;
    configSystem.saveConfig(configSystem.getFullConfig());

    return interaction.reply({
      content: `🛡️ Mode Lockdown ${!currentState ? '🟢 ACTIVÉ' : '🔴 DÉSACTIVÉ'}`,
      flags: 64
    });
  }
}

module.exports = AntiRaidSystem;