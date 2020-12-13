require('dotenv').config();

const Discord = require('discord.js');
const fs = require('fs');
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

async function loadRoles(guild) {
  const file = await util.promisify(fs.readFile)('roles.yaml', 'utf8');
  const c = YAML.parse(file);
  const roles = [
    ...Object.entries(c.power).map(([name, data]) => newRole(guild, name, data)),
    ...Object.entries(c.sidebar)
      .map(([name, color]) => newRole(guild, name, { color, hoist: true })),
    ...Object.entries(c.colors).map(([name, { color }]) => newRole(guild, name, { color })),
    ...Object.entries(c.special).map(([name, color]) => newRole(guild, name, { color })),
    ...c.other.map((name) => newRole(guild, name)),
    ...Object.keys(c.pronouns).map((name) => newRole(guild, name)),
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

async function run() {
  const guild = await client.guilds.fetch(process.env.GUILD);

  // create / modify roles
  const myRole = guild.me.roles.highest;
  const roles = await Promise.all((await loadRoles(guild)).map((role) => {
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
}

client.on('ready', () => run().catch(console.error).finally(() => client.destroy()));
client.login(process.env.TOKEN);
