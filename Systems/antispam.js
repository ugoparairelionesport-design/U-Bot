diff --git a/Systems/antispam.js b/Systems/antispam.js
index 338654e77d3ef725fe335e2bf1467cebaa66581b..d3215f2aed3b5bd60975ed8af6d0c5cd902e45ca 100644
--- a/Systems/antispam.js
+++ b/Systems/antispam.js
@@ -1,105 +1,145 @@
 const { EmbedBuilder, PermissionsBitField } = require('discord.js');
 const configSystem = require('./configsystem');
 
 class AntiSpamSystem {
   constructor(client) {
     this.client = client;
-    this.users = new Map(); // key: guildId_userId, value: { messages: [], lastContent: string, count: number }
+    this.users = new Map(); // key: guildId_userId, value: { messages: [], lastContent: string, duplicateCount: number }
     console.log('🚫 Système Anti-Spam initialisé');
   }
 
   async handleMessage(message) {
-    if (!message.guild || message.author.bot || message.member?.permissions.has(PermissionsBitField.Flags.ManageMessages)) return;
+    if (!message.guild || message.author.bot) return;
+    if (message.member?.permissions.has(PermissionsBitField.Flags.ManageMessages)) return;
 
     const guildConfig = configSystem.getGuildConfig(message.guild.id);
     const settings = guildConfig.antiSpam;
 
     if (!settings?.enabled) return;
 
     const now = Date.now();
     const key = `${message.guild.id}_${message.author.id}`;
     let userData = this.users.get(key) || { messages: [], lastContent: '', duplicateCount: 0 };
 
-    // Nettoyage des vieux messages (fenêtre glissante)
-    const windowMs = (settings.window || 5) * 1000;
+    const windowMs = Math.max(1, settings.window || 5) * 1000;
+    const cleanContent = String(message.content || '').trim().toLowerCase();
+
     userData.messages = userData.messages.filter(m => now - m.time < windowMs);
-    userData.messages.push({ time: now, content: message.content });
+    userData.messages.push({ time: now, content: cleanContent, messageId: message.id });
 
     let violation = null;
 
-    // 1. Détection de Flood (Débit)
     if (userData.messages.length > (settings.maxMessages || 5)) {
-      violation = "Flood (Trop de messages)";
+      violation = 'Flood (trop de messages)';
     }
 
-    // 2. Détection de Répétition (Doublons)
-    if (message.content === userData.lastContent && message.content.length > 3) {
-      userData.duplicateCount++;
-      if (userData.duplicateCount >= (settings.maxDuplicates || 3)) {
-        violation = "Répétition de messages";
-      }
+    if (cleanContent && cleanContent === userData.lastContent && cleanContent.length > 2) {
+      userData.duplicateCount += 1;
     } else {
-      userData.duplicateCount = 0;
+      userData.duplicateCount = 1;
+    }
+
+    if (cleanContent && userData.duplicateCount >= (settings.maxDuplicates || 3)) {
+      violation = 'Répétition de messages';
     }
-    userData.lastContent = message.content;
 
-    // 3. Détection de Link Spam
-    const links = message.content.match(/https?:\/\/[^\s]+/g);
-    if (links && links.length > (settings.maxLinks || 3)) {
-      violation = "Spam de liens";
+    userData.lastContent = cleanContent;
+
+    const links = message.content.match(/https?:\/\/[^\s]+/gi);
+    if (links && links.length > (settings.maxLinks || 2)) {
+      violation = 'Spam de liens';
     }
 
     this.users.set(key, userData);
 
     if (violation) {
-      await this.applySanction(message, violation, settings);
+      await this.applySanction(message, violation, settings, userData);
+      this.resetUser(message.guild.id, message.author.id);
     }
   }
 
-  async applySanction(message, reason, settings) {
+  async deleteRecentSpamMessages(message, userData) {
+    const { channel, author } = message;
+    const botMember = message.guild.members.me;
+
+    if (!botMember || !channel.permissionsFor(botMember).has(PermissionsBitField.Flags.ManageMessages)) {
+      return;
+    }
+
+    const messageIds = [...new Set(userData.messages.map(m => m.messageId).filter(Boolean))];
+    const messages = await channel.messages.fetch({ limit: 50 }).catch(() => null);
+    if (!messages) return;
+
+    const deletableMessages = messages.filter(m =>
+      m.author.id === author.id &&
+      (messageIds.includes(m.id) || m.id === message.id) &&
+      Date.now() - m.createdTimestamp < 14 * 24 * 60 * 60 * 1000
+    );
+
+    if (deletableMessages.size > 1) {
+      await channel.bulkDelete(deletableMessages, true).catch(() => {});
+    } else {
+      await message.delete().catch(() => {});
+    }
+  }
+
+  async applySanction(message, reason, settings, userData) {
     const { member, guild, author, channel } = message;
 
     try {
-      // Supprimer les messages de flood
-      if (channel.permissionsFor(this.client.user).has(PermissionsBitField.Flags.ManageMessages)) {
-        await message.delete().catch(() => {});
-      }
+      await this.deleteRecentSpamMessages(message, userData);
 
       const embed = new EmbedBuilder()
         .setTitle('🚫 Protection Anti-Spam')
         .setThumbnail(author.displayAvatarURL())
         .setColor('#FF0000')
         .setTimestamp();
 
-      switch (settings.action) {
-        case 'timeout':
-          const duration = (settings.timeoutDuration || 10) * 60 * 1000;
-          await member.timeout(duration, `Anti-Spam: ${reason}`);
-          embed.setDescription(`${author} a été mis en sourdine pendant ${settings.timeoutDuration} min.\n**Raison :** ${reason}`);
+      const action = String(settings.action || 'timeout').toLowerCase();
+
+      switch (action) {
+        case 'timeout': {
+          const durationMinutes = Math.max(1, settings.timeoutDuration || 10);
+          if (!member.moderatable) {
+            embed.setDescription(`⚠️ ${author} a déclenché l'anti-spam, mais je ne peux pas le sanctionner.\n**Raison :** ${reason}\n**Action prévue :** timeout ${durationMinutes} min`);
+            break;
+          }
+          await member.timeout(durationMinutes * 60 * 1000, `Anti-Spam: ${reason}`);
+          embed.setDescription(`${author} a été mis en sourdine pendant ${durationMinutes} min.\n**Raison :** ${reason}`);
           break;
+        }
         case 'kick':
+          if (!member.kickable) {
+            embed.setDescription(`⚠️ ${author} a déclenché l'anti-spam, mais je ne peux pas l'expulser.\n**Raison :** ${reason}`);
+            break;
+          }
           await member.kick(`Anti-Spam: ${reason}`);
           embed.setDescription(`${author} a été expulsé.\n**Raison :** ${reason}`);
           break;
         case 'ban':
+          if (!member.bannable) {
+            embed.setDescription(`⚠️ ${author} a déclenché l'anti-spam, mais je ne peux pas le bannir.\n**Raison :** ${reason}`);
+            break;
+          }
           await member.ban({ reason: `Anti-Spam: ${reason}` });
           embed.setDescription(`${author} a été banni.\n**Raison :** ${reason}`);
           break;
-        default: // warn
+        default:
           embed.setDescription(`⚠️ ${author}, merci de ralentir. Le spam est interdit.\n**Raison :** ${reason}`);
           await channel.send({ content: `${author}`, embeds: [embed] }).then(m => setTimeout(() => m.delete().catch(() => {}), 10000));
-          return; // Pas besoin de log complet pour un simple warn
+          await configSystem.sendLog(guild, embed, settings.logChannel);
+          return;
       }
 
       await configSystem.sendLog(guild, embed, settings.logChannel);
     } catch (err) {
-      console.error("❌ Erreur lors de la sanction Anti-Spam:", err.message);
+      console.error('❌ Erreur lors de la sanction Anti-Spam:', err.message);
     }
   }
 
   resetUser(guildId, userId) {
     this.users.delete(`${guildId}_${userId}`);
   }
 }
 
-module.exports = AntiSpamSystem;
\ No newline at end of file
+module.exports = AntiSpamSystem;
