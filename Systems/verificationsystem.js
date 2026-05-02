const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, PermissionsBitField } = require('discord.js');
const configSystem = require('./configsystem');

class VerificationSystem {
  constructor(client) {
    this.client = client;
    this.pendingVerifications = new Map(); // userId -> code
    console.log('🤖 Système de Vérification Humaine initialisé');
  }

  async handleVerifyButtonClick(interaction) {
    const guildConfig = configSystem.getGuildConfig(interaction.guildId);
    const settings = guildConfig.verification;

    if (!settings?.enabled) {
      return interaction.reply({ content: "❌ Le système de vérification est actuellement désactivé.", flags: 64 });
    }

    // Vérifier si l'utilisateur a déjà le rôle
    if (interaction.member.roles.cache.has(settings.roleId)) {
      return interaction.reply({ content: "✅ Vous êtes déjà vérifié sur ce serveur.", flags: 64 });
    }

    // Générer un code Captcha aléatoire (6 caractères alphanumériques)
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    this.pendingVerifications.set(interaction.user.id, code);

    const embed = new EmbedBuilder()
      .setTitle("🛡️ Vérification Humaine")
      .setDescription(`Pour accéder au serveur, veuillez recopier le code ci-dessous.\n\n**Code :** \`${code}\`\n\n*Attention : Respectez les majuscules.*`)
      .setColor("#5865F2")
      .setFooter({ text: "Ce code expire dans 5 minutes." });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('verify_enter_code')
        .setLabel('Saisir le code')
        .setStyle(ButtonStyle.Success)
    );

    await interaction.reply({ embeds: [embed], components: [row], flags: 64 });

    // Expiration du code
    setTimeout(() => this.pendingVerifications.delete(interaction.user.id), 300000);
  }

  async showCodeModal(interaction) {
    const modal = new ModalBuilder()
      .setCustomId('modal_verify_code')
      .setTitle('Validation du Captcha')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('captcha_input')
            .setLabel('Entrez le code affiché précédemment')
            .setPlaceholder('Ex: A1B2C3')
            .setMinLength(6)
            .setMaxLength(6)
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
        )
      );

    await interaction.showModal(modal);
  }

  async handleModalSubmit(interaction) {
    const input = interaction.fields.getTextInputValue('captcha_input').trim().toUpperCase();
    const expected = this.pendingVerifications.get(interaction.user.id);
    const guildConfig = configSystem.getGuildConfig(interaction.guildId);
    const settings = guildConfig.verification;

    if (!expected || input !== expected) {
      return interaction.reply({ content: "❌ Code incorrect ou expiré. Veuillez réessayer.", flags: 64 });
    }

    try {
      const role = await interaction.guild.roles.fetch(settings.roleId);
      if (!role) throw new Error("Rôle introuvable");

      await interaction.member.roles.add(role);
      this.pendingVerifications.delete(interaction.user.id);

      await interaction.reply({ content: "✅ Vérification réussie ! Vous avez maintenant accès au serveur.", flags: 64 });

      // Log l'action
      const logEmbed = new EmbedBuilder()
        .setTitle("👤 Membre Vérifié")
        .setDescription(`${interaction.user} a réussi le captcha.`)
        .setColor("#00FF00")
        .setTimestamp();
      
      await configSystem.sendLog(interaction.guild, logEmbed);

    } catch (err) {
      console.error("❌ Error verification:", err);
      await interaction.reply({ content: "❌ Erreur lors de l'attribution du rôle. Contactez un administrateur.", flags: 64 });
    }
  }
}

module.exports = VerificationSystem;