const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const configSystem = require('./configsystem');

class DmLockSystem {
  constructor(client) {
    this.client = client;
    console.log('📩 Système DM Lock initialisé');
  }

  async handleMemberJoin(member) {
    const guildConfig = configSystem.getGuildConfig(member.guild.id);
    const settings = guildConfig.dmLock;

    if (!settings?.enabled) return;

    const embed = new EmbedBuilder()
      .setTitle(`🛡️ Sécurité : Protégez vos MPs sur ${member.guild.name}`)
      .setDescription(
        `Bonjour **${member.user.username}**,\n\n` +
        `Pour votre sécurité sur notre communauté, nous vous recommandons de **désactiver vos messages privés** pour les membres de ce serveur.\n\n` +
        `**Pourquoi ?**\n` +
        `Les arnaqueurs utilisent les DMs pour envoyer des liens de phishing, des faux bots ou des arnaques crypto en se faisant passer pour le staff.\n\n` +
        `**Comment faire ?**\n` +
        `1. Faites un clic droit sur l'icône du serveur.\n` +
        `2. Allez dans **Paramètres de confidentialité**.\n` +
        `3. Désactivez **"Messages privés"**.`
      )
      .setColor('#FF0000')
      .setThumbnail(member.guild.iconURL())
      .setFooter({ text: "U-Bot Security Protocol • Protection DM" })
      .setTimestamp();

    try {
      await member.send({ embeds: [embed] });
    } catch (err) {
      // Si l'envoi échoue, c'est que l'utilisateur a déjà ses DMs fermés (parfait)
      console.log(`ℹ️ [DM-LOCK] Message non envoyé à ${member.user.tag} (DMs déjà fermés).`);
    }
  }

  async sendSafetyPanel(channel) {
    const embed = new EmbedBuilder()
      .setTitle("🛡️ Centre de Prévention des Arnaques (DMs)")
      .setDescription(
        "**Attention aux messages privés suspects !**\n\n" +
        "• ❌ Le Staff ne vous demandera **JAMAIS** votre mot de passe ou un code 2FA.\n" +
        "• ❌ Ne cliquez jamais sur des liens promettant du **Nitro Gratuit**.\n" +
        "• ❌ Méfiez-vous des offres d'investissement ou de \"travail\" reçues en MP.\n\n" +
        "Pour une sécurité maximale, désactivez vos DMs dans les paramètres de confidentialité du serveur."
      )
      .setColor("#2B2D31")
      .setImage("https://i.imgur.com/mY7j2Wj.png"); // Image illustrative optionnelle

    await channel.send({ embeds: [embed] });
  }
}

module.exports = DmLockSystem;