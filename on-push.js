require('dotenv').config();

const Discord = require('discord.js');
const fs = require('fs');
const pluralize = require('pluralize');
const process = require('process');
const util = require('util');
const YAML = require('yaml');

const client = new Discord.Client();

function newRole(guild, name, data) {
  const existing = guild.roles.cache.find((x) => name === x.name);
  const id = existing ? { id: existing.id } : {};
  return {
    ...id,
    name,
    color: 'DEFAULT',
    hoist: false,
    mentionable: false,
    permissions: existing && existing.managed ? existing.permissions : [],
    ...data,
  };
}

async function loadRoles(c, guild) {
  const roles = [
    ...Object.entries(c.power).map(([name, data]) => newRole(guild, name, data)),
    ...Object.entries(c.sidebar)
      .map(([name, color]) => newRole(guild, name, { color, hoist: true })),
    ...Object.entries(c.colors).map(([name, { color }]) => newRole(guild, name, { color })),
    ...Object.entries(c.special).map(([name, color]) => newRole(guild, name, { color })),
    ...c.other.map((name) => newRole(guild, name)),
    ...[...Object.keys(c.pronouns1), ...Object.keys(c.pronouns2)]
      .map((name) => newRole(guild, name)),
    newRole(guild, '@everyone', { permissions: c.everyone }),
  ];

  guild.roles.cache.each((role) => {
    if (!(role.name === '@everyone') && !roles.find((r) => role.id === r.id)) {
      roles.splice(roles.length - 1, 0, {
        id: role.id,
        name: role.name,
        color: role.color,
        hoist: role.hoist,
        mentionable: role.mentionable,
        permissions: role.permissions,
      });
    }
  });
  return roles;
}

async function carlRelay(guild, message) {
  const spamRoom = guild.channels.cache.find((channel) => channel.name === 'carl-spam-zone');
  // const modRole = guild.roles.cache.find((role) => role.name === 'Society Caretaker');
  // await spamRoom.send(`<@&${modRole.id}> ${message}`);
  await spamRoom.send(`please relay to carl: \`\`\`\n${message}\n\`\`\``);
}

function rrProcess(roles) {
  return Object.entries(roles).map(([role, value]) => {
    if (typeof value === 'string') {
      return {
        name: role,
        emoji: value,
        help: `${value} ${role}`,
      };
    }
    return {
      name: role,
      emoji: value.emoji,
      help: `${value.emoji} **${pluralize(role)}** *(${value.humanColor})* ${value.desc}.`,
    };
  });
}

function hasReaction(message, emoji) {
  return (message.reactions.cache.has(emoji)
    || message.reactions.cache.has(emoji.replace(/\ufe0f$/, '')));
}

async function checkRoleMessage(guild, config, message) {
  const embed = message.embeds[0];
  const data = {
    0x9370db: {
      roles: rrProcess(config.colors),
      desc: config.strings.colors,
    },
    0x358cdb: {
      roles: rrProcess(config.pronouns1),
      desc: config.strings.pronouns1,
    },
    0x1fd9b7: {
      roles: rrProcess(config.pronouns2),
      desc: config.strings.pronouns2,
    },
  }[embed.color.toString()];

  const desc = [data.desc, ...data.roles.map((role) => role.help)].join('\n');
  if (desc !== `${embed.title} | ${embed.description}`) {
    await carlRelay(guild, `c!rr edit ${message.id} ${desc}`);
  }

  const missing = data.roles.filter((role) => !hasReaction(message, role.emoji))
    .map((role) => `${role.emoji} ${role.name}`).join('\n');
  if (missing) {
    await carlRelay(guild, `c!rr addmany #roles-and-sigils ${message.id}\n${missing}`);
  }
}

async function run() {
  const file = await util.promisify(fs.readFile)('roles.yaml', 'utf8');
  const config = YAML.parse(file);

  const guild = await client.guilds.fetch(process.env.GUILD);

  // create / modify roles
  const myRole = guild.me.roles.highest;
  const roles = await Promise.all((await loadRoles(config, guild)).map((role) => {
    if (role.id) {
      if (myRole.position > role.position) {
        return guild.roles.fetch(role.id).edit(role);
      }
      return Promise.resolve(role);
    }
    return guild.roles.create({ data: role });
  }));

  // set role positions
  await guild.setRolePositions(roles.slice(0).reverse()
    .map((role, position) => ({ role: role.id, position })));

  // check reaction role messages and send corrections to #carl-spam-zone
  const roleRoom = guild.channels.cache.find((channel) => channel.name === 'roles-and-sigils');
  const roleMessages = await roleRoom.messages.fetch();
  await Promise.all(roleMessages.map((message) => checkRoleMessage(guild, config, message)));
}

client.on('ready', () => run().catch(console.error).finally(() => client.destroy()));
client.login(process.env.TOKEN);
