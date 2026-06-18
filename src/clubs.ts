import { readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import type { ClubsJson, ClubConfig } from './types.js';
import { searchTenants, getTenantByUid } from './playtomic.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLUBS_PATH = join(__dirname, '..', 'clubs.json');

function loadClubs(): ClubsJson {
  return JSON.parse(readFileSync(CLUBS_PATH, 'utf-8')) as ClubsJson;
}

function saveClubs(data: ClubsJson): void {
  writeFileSync(CLUBS_PATH, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

function parseArgs(args: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--') && i + 1 < args.length && !args[i + 1].startsWith('--')) {
      result[args[i].slice(2)] = args[i + 1];
      i++;
    }
  }
  return result;
}

async function geocode(place: string): Promise<{ lat: number; lon: number } | null> {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(place)}&format=json&limit=1`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'padels-scraper/1.0 (private-market-research)' },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { lat: string; lon: string }[];
  if (!data[0]) return null;
  // Nominatim Rate-Limit: 1 Request/s
  await new Promise((r) => setTimeout(r, 1100));
  return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
}

function upsertClub(data: ClubsJson, club: ClubConfig): void {
  const idx = data.clubs.findIndex((c) => c.tenant_id === club.tenant_id);
  if (idx >= 0) {
    console.log(`Club ${club.name} bereits vorhanden – wird aktualisiert.`);
    data.clubs[idx] = { ...data.clubs[idx], ...club };
  } else {
    data.clubs.push(club);
  }
}

async function cmdAdd(args: string[]): Promise<void> {
  const flags = parseArgs(args);

  if (flags['uid']) {
    const tenant = await getTenantByUid(flags['uid']);
    if (!tenant) {
      console.error(`Kein Club mit uid "${flags['uid']}" gefunden.`);
      process.exit(1);
    }
    const data = loadClubs();
    upsertClub(data, {
      alias: tenant.tenant_uid,
      tenant_id: tenant.tenant_id,
      name: tenant.tenant_name,
      city: tenant.address.city,
      lat: tenant.address.coordinate.lat,
      lon: tenant.address.coordinate.lon,
      timezone: tenant.address.timezone ?? 'Europe/Berlin',
      active: true,
    });
    saveClubs(data);
    console.log(`✓ ${tenant.tenant_name} (${tenant.tenant_uid}) hinzugefügt.`);
    return;
  }

  if (flags['search'] && flags['near']) {
    const coords = await geocode(flags['near']);
    if (!coords) {
      console.error(`Ort "${flags['near']}" konnte nicht geocodiert werden.`);
      process.exit(1);
    }
    const radius = parseInt(flags['radius'] ?? '80000', 10);
    const tenants = await searchTenants({ ...coords, radius, q: flags['search'] });
    if (tenants.length === 0) {
      console.log('Keine Clubs gefunden.');
      return;
    }
    tenants.forEach((t, i) =>
      console.log(`  [${i + 1}] ${t.tenant_name} (${t.address.city}) – ${t.tenant_uid}`)
    );
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise<string>((resolve) =>
      rl.question('Nummer auswählen (oder Enter zum Abbrechen): ', resolve)
    );
    rl.close();
    const num = parseInt(answer.trim(), 10);
    if (!num || num < 1 || num > tenants.length) {
      console.log('Abgebrochen.');
      return;
    }
    const tenant = tenants[num - 1];
    const data = loadClubs();
    upsertClub(data, {
      alias: tenant.tenant_uid,
      tenant_id: tenant.tenant_id,
      name: tenant.tenant_name,
      city: tenant.address.city,
      lat: tenant.address.coordinate.lat,
      lon: tenant.address.coordinate.lon,
      timezone: tenant.address.timezone ?? 'Europe/Berlin',
      active: true,
    });
    saveClubs(data);
    console.log(`✓ ${tenant.tenant_name} hinzugefügt.`);
    return;
  }

  console.error('Verwendung: npm run clubs -- add --uid <slug>');
  console.error('       oder: npm run clubs -- add --search <q> --near <ort> [--radius <m>]');
  process.exit(1);
}

function cmdList(): void {
  const data = loadClubs();
  if (data.clubs.length === 0) {
    console.log('Keine Clubs konfiguriert. Mit "npm run clubs -- add" hinzufügen.');
    return;
  }
  console.log(`\nKonfigurierte Clubs (${data.clubs.length}):\n`);
  for (const c of data.clubs) {
    const status = c.active ? '✓ aktiv  ' : '✗ inaktiv';
    console.log(`  ${status}  ${c.alias.padEnd(30)} ${c.name} (${c.city ?? '?'})`);
  }
  console.log(`\nPoll-Konfiguration: opening ${data.poll.opening_window_local[0]}–${data.poll.opening_window_local[1]}, heute+${data.poll.opening_days_ahead} Tage / horizon ${data.poll.horizon_days_ahead} Tage voraus\n`);
}

function cmdToggle(alias: string, active: boolean): void {
  const data = loadClubs();
  const club = data.clubs.find((c) => c.alias === alias);
  if (!club) {
    console.error(`Club "${alias}" nicht gefunden.`);
    process.exit(1);
  }
  club.active = active;
  saveClubs(data);
  console.log(`✓ ${club.name} ist jetzt ${active ? 'aktiv' : 'inaktiv'}.`);
}

async function cmdDiscover(args: string[]): Promise<void> {
  const flags = parseArgs(args);
  if (!flags['near']) {
    console.error('Verwendung: npm run clubs -- discover --near <ort> [--radius <m>]');
    process.exit(1);
  }
  const coords = await geocode(flags['near']);
  if (!coords) {
    console.error(`Ort "${flags['near']}" konnte nicht geocodiert werden.`);
    process.exit(1);
  }
  const radius = parseInt(flags['radius'] ?? '80000', 10);
  const tenants = await searchTenants({ ...coords, radius });
  if (tenants.length === 0) {
    console.log('Keine Padel-Clubs im Umkreis gefunden.');
    return;
  }
  console.log(`\nGefundene Clubs (${tenants.length}) im Umkreis von ${radius / 1000} km um ${flags['near']}:\n`);
  for (const t of tenants) {
    console.log(`  ${t.tenant_uid.padEnd(35)} ${t.tenant_name} (${t.address.city})`);
  }
  console.log('\nMit "npm run clubs -- add --uid <slug>" einen Club hinzufügen.\n');
}

// Main
const [, , command, ...rest] = process.argv;

switch (command) {
  case 'add':
    await cmdAdd(rest);
    break;
  case 'list':
    cmdList();
    break;
  case 'enable':
    cmdToggle(rest[0], true);
    break;
  case 'disable':
    cmdToggle(rest[0], false);
    break;
  case 'discover':
    await cmdDiscover(rest);
    break;
  default:
    console.log('Verfügbare Befehle: add, list, enable, disable, discover');
}
