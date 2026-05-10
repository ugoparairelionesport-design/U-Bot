diff --git a/Systems/configsystem.js b/Systems/configsystem.js
index 2acc9f65ce16ebf377872e9e7be6dd1d495dabf6..2176202783ebb88e9b7ec587b5317f654c3519f5 100644
--- a/Systems/configsystem.js
+++ b/Systems/configsystem.js
@@ -300,50 +300,98 @@ function formatDate() {
   const hour = String(d.getHours()).padStart(2, '0');
   const minute = String(d.getMinutes()).padStart(2, '0');
   return `${day}-${month}-${hour}h${minute}`;
 }
 
 function sanitizeChannelPart(value, fallback = 'ticket') {
   const sanitized = String(value || '')
     .normalize('NFD')
     .replace(/[\u0300-\u036f]/g, '')
     .toLowerCase()
     .replace(/[^a-z0-9]+/g, '-')
     .replace(/^-+|-+$/g, '')
     .slice(0, 32);
 
   return sanitized || fallback;
 }
 
 function trimChannelName(name, maxLength = 100) {
   return name
     .replace(/-+/g, '-')
     .replace(/^-+|-+$/g, '')
     .slice(0, maxLength)
     .replace(/-+$/g, '');
 }
 
+
+function getPublicBaseUrl() {
+  const replitDomains = process.env.REPLIT_DOMAINS || process.env.REPLIT_DEV_DOMAIN;
+  if (replitDomains) {
+    const domain = String(replitDomains).split(',')[0].trim();
+    if (domain) return `https://${domain}`;
+  }
+
+  const replName = process.env.REPL_SLUG;
+  const replOwner = process.env.REPL_OWNER;
+  if (replName && replOwner) return `https://${replName}.${replOwner}.replit.app`;
+
+  return null;
+}
+
+function getImageExtensionFromContentType(contentType) {
+  const cleanType = String(contentType || '').split(';')[0].trim().toLowerCase();
+  if (cleanType === 'image/jpeg' || cleanType === 'image/jpg') return '.jpg';
+  if (cleanType === 'image/png') return '.png';
+  if (cleanType === 'image/gif') return '.gif';
+  if (cleanType === 'image/webp') return '.webp';
+  return null;
+}
+
+function getImageExtensionFromBuffer(buffer) {
+  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]))) return '.png';
+  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) return '.jpg';
+  if (buffer.subarray(0, 3).toString() === 'GIF') return '.gif';
+  if (buffer.subarray(8, 12).toString() === 'WEBP') return '.webp';
+  return null;
+}
+
+function isTicketPanelMessage(message) {
+  return Boolean(message?.components?.some(row =>
+    row.components?.some(component => component.customId === 'ticket_select')
+  ));
+}
+
+function isDetailedTicketPanelMessage(message) {
+  const embed = message?.embeds?.[0];
+  const title = embed?.title || '';
+  const description = embed?.description || '';
+
+  return title.includes('Tickets') &&
+    description.includes("Centre d'Assistance & Support") &&
+    description.includes('Procédure');
+}
+
 function stripTicketStatusEmoji(channelName) {
   return String(channelName || '').replace(/-?[🟠🟢🔴]$/u, '');
 }
 
 function buildTicketChannelName(choice, user, statusEmoji = '🟠') {
   const categoryPart = sanitizeChannelPart(choice, 'ticket');
   const userPart = sanitizeChannelPart(user?.username || user?.displayName || user?.tag || user?.id, 'user');
   const baseName = trimChannelName(`${categoryPart}-${userPart}-${formatDate()}`, 96);
   return `${baseName}-${statusEmoji}`;
 }
 
 async function setTicketStatusEmoji(channel, statusEmoji) {
   if (!channel?.setName || channel.name.endsWith('fermeture-en-cours')) return;
   const baseName = trimChannelName(stripTicketStatusEmoji(channel.name), 96);
   const newName = `${baseName}-${statusEmoji}`;
 
   if (newName !== channel.name) {
     await channel.setName(newName).catch(() => {});
   }
 }
 
 function getRoleIds(value) {
   if (!value) return [];
 
   if (Array.isArray(value)) {
@@ -727,83 +775,92 @@ async function saveTicketArchive(guild, channel, requestedBy) {
         )
         .setColor(guildConfig.globalEmbedColor)
         .setTimestamp()
     ],
     files: [attachment]
   }).catch(() => null);
 
   return { ok: true };
 }
 
 /**
  * Nettoie les anciens messages de panel de tickets qui pourraient exister sur Discord
  * mais ne sont plus référencés ou sont obsolètes.
  * @param {Client} client Le client Discord.
  * @returns {Promise<number>} Le nombre de panels supprimés.
  */
 async function cleanupLegacyTicketPanels(client) {
   let deletedCount = 0;
   if (!configData.guilds) return deletedCount;
 
   for (const guildId in configData.guilds) {
     const guildConfig = configData.guilds[guildId];
     const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
     if (!guild) continue;
 
-    // On récupère tous les salons où un panel est censé exister
-    const panelChannelIds = Object.keys(guildConfig.panelMessages || {});
+    const guildChannels = await guild.channels.fetch().catch(() => null);
+    const panelChannelIds = new Set(Object.keys(guildConfig.panelMessages || {}));
+
+    if (guildChannels) {
+      for (const channel of guildChannels.values()) {
+        if (channel?.isTextBased?.()) panelChannelIds.add(channel.id);
+      }
+    }
 
     for (const channelId of panelChannelIds) {
-      const channel = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);
+      const channel = guildChannels?.get(channelId) || guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);
       if (!channel || !channel.isTextBased()) continue;
 
       try {
-        // SCAN ULTRA-AGRESSIF : On cherche les messages contenant le menu 'ticket_select'
         const messages = await channel.messages.fetch({ limit: 50 });
         const currentPanelId = guildConfig.panelMessages[channelId];
-
-        const botPanels = messages.filter(m => 
-          m.author.id === client.user.id && 
-          m.components.some(row => 
-            row.components.some(c => c.customId === 'ticket_select')
-          ) &&
-          m.id !== currentPanelId // On ne supprime pas le panel "officiel" s'il existe
-        );
-
-        for (const [, msg] of botPanels) {
-          console.log(`🧹 [PURGE] Doublon détecté et supprimé dans #${channel.name}`);
-          await msg.delete().catch(() => {});
-          deletedCount++;
+        const botPanels = [...messages.values()]
+          .filter(m => m.author.id === client.user.id && isTicketPanelMessage(m))
+          .sort((a, b) => b.createdTimestamp - a.createdTimestamp);
+        const detailedPanels = botPanels.filter(isDetailedTicketPanelMessage);
+        const currentPanel = botPanels.find(m => m.id === currentPanelId);
+        const currentPanelIsDetailed = currentPanel && isDetailedTicketPanelMessage(currentPanel);
+        const panelToKeep = currentPanelIsDetailed ? currentPanel : detailedPanels[0];
+
+        for (const msg of botPanels) {
+          const mustDelete = !panelToKeep || msg.id !== panelToKeep.id || !isDetailedTicketPanelMessage(msg);
+          if (mustDelete) {
+            console.log(`🧹 [PURGE] Panel ticket obsolète supprimé dans #${channel.name}`);
+            await msg.delete().catch(() => {});
+            deletedCount++;
+          }
         }
 
-        // Si le panel officiel stocké n'a pas été trouvé dans le scan mais existe, on le vérifie
-        if (currentPanelId) {
+        if (panelToKeep) {
+          guildConfig.panelMessages[channelId] = panelToKeep.id;
+          const keepOptions = panelToKeep.components?.[0]?.components?.[0]?.options?.map(option => option.value) || guildConfig.panelOptions[channelId] || [];
+          guildConfig.panelOptions[channelId] = keepOptions;
+        } else if (currentPanelId) {
           const officialMsg = await channel.messages.fetch(currentPanelId).catch(() => null);
-          if (!officialMsg) {
+          if (!officialMsg || !isDetailedTicketPanelMessage(officialMsg)) {
             delete guildConfig.panelMessages[channelId];
             delete guildConfig.panelOptions[channelId];
-            deletedCount++;
           }
         }
       } catch (error) {
         console.error(`❌ Erreur lors du scan du salon ${channelId}:`, error.message);
       }
     }
   }
   saveConfig(configData);
   return deletedCount;
 }
 
 /**
  * Rafraîchit les contrôles (boutons) des tickets actifs pour s'assurer qu'ils sont à jour.
  * @param {Client} client Le client Discord.
  * @returns {Promise<number>} Le nombre de tickets mis à jour.
  */
 async function refreshActiveTicketControls(client) {
   let updatedCount = 0;
   if (!configData.guilds) return updatedCount;
 
   for (const guildId in configData.guilds) {
     const guildConfig = configData.guilds[guildId];
     const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
     if (!guild) continue;
 
@@ -1092,58 +1149,64 @@ async function handleButtons(interaction) {
         return interaction.showModal(new ModalBuilder().setCustomId('modal_set_global_banner').setTitle('Image de fond des Embeds').addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('banner_url').setLabel('URL de l\'image').setPlaceholder('Lien direct').setValue(guildConfig.globalEmbedBanner || '').setStyle(TextInputStyle.Short).setRequired(false))));
       case 'global_color_set_btn':
         return interaction.showModal(new ModalBuilder().setCustomId('modal_set_global_color').setTitle('Couleur des Embeds').addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('color_hex').setLabel('Code HEX').setPlaceholder('#5865F2').setValue(guildConfig.globalEmbedColor || '#5865F2').setStyle(TextInputStyle.Short).setRequired(true))));
 
       // == PROTECTION HUB ==
       case 'prot_hub_back':
         return await sendProtectionConfigPanel(interaction);
       case 'prot_hub_antiraid':
         return await sendAntiRaidConfigPanel(interaction);
       case 'prot_hub_antispam':
         return await sendAntiSpamConfigPanel(interaction);
       case 'prot_hub_captcha':
         return await sendVerificationConfigPanel(interaction);
       case 'prot_hub_dmlock':
         return await sendDmLockConfigPanel(interaction);
       case 'antiraid_toggle_status':
         guildConfig.antiRaid.enabled = !guildConfig.antiRaid.enabled;
         saveConfig(configData);
         return await sendAntiRaidConfigPanel(interaction);
       case 'antiraid_setup':
         return interaction.showModal(buildAntiRaidModal(guildConfig.antiRaid));
       case 'antispam_toggle_status':
         guildConfig.antiSpam.enabled = !guildConfig.antiSpam.enabled;
         saveConfig(configData);
         return await sendAntiSpamConfigPanel(interaction);
+      case 'antispam_setup':
+        return interaction.showModal(buildAntiSpamModal(guildConfig.antiSpam));
       case 'verify_toggle_status':
         guildConfig.verification.enabled = !guildConfig.verification.enabled;
         saveConfig(configData);
         return await sendVerificationConfigPanel(interaction);
       case 'verify_setup':
         return interaction.showModal(buildVerificationModal(guildConfig.verification));
       case 'verify_send_panel':
         return await sendUserVerificationPanel(interaction);
+      case 'verify_start':
+        return await interaction.client.verification?.handleVerifyButtonClick(interaction);
+      case 'verify_enter_code':
+        return await interaction.client.verification?.showCodeModal(interaction);
       case 'dmlock_toggle_status':
         guildConfig.dmLock.enabled = !guildConfig.dmLock.enabled;
         saveConfig(configData);
         return await sendDmLockConfigPanel(interaction);
       case 'dmlock_send_panel':
         return await sendUserDmSafetyPanel(interaction);
 
       // == LOGS & ENTRANCE ==
       case 'logs_toggle_status':
         return await toggleLogsStatus(interaction);
       case 'logs_setup_channels': return await setupLogsChannels(interaction);
       case 'entrance_toggle_status': return await toggleEntranceStatus(interaction);
       case 'entrance_toggle_rules': return await toggleEntranceRules(interaction);
       case 'entrance_toggle_image': return await toggleEntranceImage(interaction);
       case 'entrance_setup_welcome': return await interaction.showModal(buildEntranceTextModal(guildConfig.entrance));
       case 'entrance_setup_roles': return await interaction.showModal(buildEntranceRolesModal(guildConfig.entrance));
       case 'entrance_setup_rules': return await interaction.showModal(buildEntranceRulesModal(guildConfig.entrance));
       case 'entrance_send_rules': return await interaction.client.entranceSystem.sendRulesPanel(interaction);
 
       // == TICKETS ==
       case 'ticket_select': {
         if (!interaction.isStringSelectMenu()) break; // S'assurer que c'est bien un menu
       const choice = interaction.values[0];
       const categoryId = guildConfig.categories[choice];
       const roleIds = getRoleIds(guildConfig.roles[choice]);
@@ -1681,77 +1744,94 @@ async function handleLiveDelete(interaction, url) {
     const guildConfig = getGuildConfig(interaction.guildId);
     const index = guildConfig.liveConfigs.findIndex(l => l.url === url);
     if (index !== -1) {
       guildConfig.liveConfigs.splice(index, 1);
       saveConfig(configData);
       return await interaction.update({ content: `✅ Configuration supprimée pour **${url}**.`, embeds: [], components: [], flags: 64 });
     }
     return await replyAndAutoDelete(interaction, { content: "❌ Erreur lors de la suppression.", flags: 64 });
   } catch (err) {
     console.error("❌ Erreur suppression live:", err);
   }
 }
 
 /* ========================= */
 async function handleModal(interaction) {
   try {
     const guildConfig = getGuildConfig(interaction.guildId);
     // RÉPONSE PRIORITAIRE : Traitement du formulaire de nom
     if (interaction.customId === 'modal_set_bot_nickname') {
       return await handleSetBotNicknameModal(interaction);
     }
 
     if (interaction.customId === 'modal_set_global_banner') {
       await interaction.deferReply({ flags: 64 });
       const url = interaction.fields.getTextInputValue('banner_url').trim();
-      guildConfig.globalEmbedBanner = url || null;
-      saveConfig(configData);
+
+      if (!url) {
+        guildConfig.globalEmbedBanner = null;
+        saveConfig(configData);
+        return interaction.editReply({ content: "✅ Image des embeds supprimée." });
+      }
+
+      if (!/^https?:\/\//i.test(url)) {
+        return interaction.editReply({ content: "❌ URL invalide : utilisez un lien direct commençant par http:// ou https://." });
+      }
       
-      // On tente une sauvegarde Replit en arrière-plan sans bloquer
       try {
-        const replName = process.env.REPL_SLUG;
-        const replOwner = process.env.REPL_OWNER;
-        if (url.startsWith('http') && replName) {
-          const response = await fetch(url);
-          if (!response.ok) throw new Error();
-          const buffer = Buffer.from(await response.arrayBuffer());
-          const assetsDir = path.join(__dirname, '../Data/assets', interaction.guildId);
-          if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir, { recursive: true });
-          fs.writeFileSync(path.join(assetsDir, 'banner.png'), buffer);
-          
-          const publicUrl = `https://${replName}.${replOwner}.replit.app/assets/${interaction.guildId}/banner.png?v=${Date.now()}`;
-          guildConfig.globalEmbedBanner = publicUrl;
-        } else {
+        const response = await fetch(url, {
+          headers: {
+            'User-Agent': 'U-Bot/2.9.17 (+Discord Embed Image Fetch)'
+          }
+        });
+        if (!response.ok) throw new Error(`HTTP ${response.status}`);
+
+        const buffer = Buffer.from(await response.arrayBuffer());
+        const contentType = response.headers.get('content-type');
+        const extension = getImageExtensionFromContentType(contentType) || getImageExtensionFromBuffer(buffer);
+        if (!extension) throw new Error(`Type d'image non supporté (${contentType || 'inconnu'})`);
+
+        const publicBaseUrl = getPublicBaseUrl();
+        if (!publicBaseUrl) {
           guildConfig.globalEmbedBanner = url;
+          saveConfig(configData);
+          return interaction.editReply({ content: "⚠️ Image enregistrée via lien direct (domaine public Replit introuvable)." });
         }
+
+        const assetsDir = path.join(__dirname, '../Data/assets', interaction.guildId);
+        if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir, { recursive: true });
+
+        const fileName = `banner${extension}`;
+        fs.writeFileSync(path.join(assetsDir, fileName), buffer);
         
+        guildConfig.globalEmbedBanner = `${publicBaseUrl}/assets/${interaction.guildId}/${fileName}?v=${Date.now()}`;
         saveConfig(configData);
         return interaction.editReply({ content: "✅ Image enregistrée avec succès !" });
       } catch (err) {
         guildConfig.globalEmbedBanner = url;
         saveConfig(configData);
-        return interaction.editReply({ content: "⚠️ Image enregistrée via lien direct (impossible de la copier localement)." });
+        return interaction.editReply({ content: `⚠️ Image enregistrée via lien direct (copie locale impossible : ${err.message}).` });
       }
     }
 
     if (interaction.customId === 'modal_set_global_color') {
       const color = interaction.fields.getTextInputValue('color_hex').trim();
 
       // Validation simple du format HEX
       if (!/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(color)) {
         return replyAndAutoDelete(interaction, { content: "❌ Code couleur HEX invalide. Utilisez le format #RRGGBB.", flags: 64 });
       }
 
       guildConfig.globalEmbedColor = color;
       saveConfig(configData);
       return replyAndAutoDelete(interaction, { content: `✅ La couleur des embeds a été mise à jour en \`${color}\` !`, flags: 64 });
     }
 
     if (interaction.customId === 'modal_logs') {
       const channelId = interaction.fields.getTextInputValue('channel_id');
       const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);
 
       if (!channel || channel.type !== ChannelType.GuildText) {
         return replyAndAutoDelete(interaction, { content: "❌ Salon invalide", flags: 64 });
       }
        guildConfig.logsChannel = channelId;
       saveConfig(configData);
@@ -2331,50 +2411,51 @@ async function sendAntiRaidConfigPanel(interaction) {
   const row = new ActionRowBuilder().addComponents(
     new ButtonBuilder().setCustomId('antiraid_toggle_status').setLabel(settings.enabled ? 'Désactiver' : 'Activer').setStyle(settings.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
     new ButtonBuilder().setCustomId('antiraid_setup').setLabel('⚙️ Paramètres').setStyle(ButtonStyle.Primary),
     new ButtonBuilder().setCustomId('prot_hub_back').setLabel('Retour').setStyle(ButtonStyle.Secondary)
   );
   return interaction.update({ embeds: [embed], components: [row] });
 }
 
 async function sendAntiSpamConfigPanel(interaction) {
   const guildConfig = getGuildConfig(interaction.guildId);
   const settings = guildConfig.antiSpam;
   const embed = new EmbedBuilder()
     .setTitle("🚫 Module Anti-Spam")
     .setDescription("Analyse les messages en temps réel pour filtrer les comportements abusifs.\n\n" +
       "**⚙️ Paramètres Actuels**\n" +
       `┣ 📡 État : ${settings.enabled ? '`🟢 Activé`' : '`🔴 Désactivé`'}\n` +
       `┣ 🔨 Sanction : \`${settings.action.toUpperCase()}\`\n` +
       `┗ 📝 Doublons max : \`${settings.maxDuplicates}\``
     )
     .setThumbnail(interaction.client.user.displayAvatarURL())
     .setImage(guildConfig.globalEmbedBanner)
     .setColor(guildConfig.globalEmbedColor);
 
   const row = new ActionRowBuilder().addComponents(
     new ButtonBuilder().setCustomId('antispam_toggle_status').setLabel(settings.enabled ? 'Désactiver' : 'Activer').setStyle(settings.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
+    new ButtonBuilder().setCustomId('antispam_setup').setLabel('⚙️ Paramètres').setStyle(ButtonStyle.Primary),
     new ButtonBuilder().setCustomId('prot_hub_back').setLabel('Retour').setStyle(ButtonStyle.Secondary)
   );
   return interaction.update({ embeds: [embed], components: [row] });
 }
 
 async function sendVerificationConfigPanel(interaction) {
   const guildConfig = getGuildConfig(interaction.guildId);
   const settings = guildConfig.verification;
   const embed = new EmbedBuilder()
     .setTitle("🤖 Module de Vérification Humaine")
     .setDescription("Force les nouveaux membres à résoudre un captcha avant d'accéder au serveur.\n\n" +
       "**⚙️ Paramètres Actuels**\n" +
       `┣ 📡 État : ${settings.enabled ? '`🟢 Activé`' : '`🔴 Désactivé`'}\n` +
       `┣ 🛡️ Rôle attribué : ${settings.roleId ? `<@&${settings.roleId}>` : '`❌ Non configuré`'}\n` +
       `┗ 📍 Salon Captcha : ${settings.channelId ? `<#${settings.channelId}>` : '`❌ Non configuré`'}`
     )
     .setThumbnail(interaction.client.user.displayAvatarURL())
     .setImage(guildConfig.globalEmbedBanner)
     .setColor(guildConfig.globalEmbedColor);
 
   const row = new ActionRowBuilder().addComponents(
     new ButtonBuilder().setCustomId('verify_toggle_status').setLabel(settings.enabled ? 'Désactiver' : 'Activer').setStyle(settings.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
     new ButtonBuilder().setCustomId('verify_setup').setLabel('⚙️ Paramètres').setStyle(ButtonStyle.Primary),
     new ButtonBuilder().setCustomId('verify_send_panel').setLabel('📤 Envoyer Panel').setStyle(ButtonStyle.Secondary),
     new ButtonBuilder().setCustomId('prot_hub_back').setLabel('Retour').setStyle(ButtonStyle.Secondary)
