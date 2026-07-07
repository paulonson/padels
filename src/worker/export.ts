// Selbstbeschreibender JSON-Export aller abgeleiteten Tabellen (Silver/Gold + Stammdaten).
// Rohdaten (availability_snapshots) sind bewusst ausgeschlossen (~400k+ Zeilen).
// Escape Hatch falls der Export zu groß wird: ?days=N-Filter auf slot_outcome.local_date.

interface ExportTable {
  key: string;
  sql: string;
  description: string;
  columns: Record<string, string>;
}

const TABLES: ExportTable[] = [
  {
    key: 'clubs',
    sql: `SELECT * FROM clubs ORDER BY name`,
    description: 'Stammdaten der beobachteten Padel-Clubs (Playtomic-Tenants)',
    columns: {
      tenant_id: 'Playtomic-Tenant-ID (Fremdschlüssel in allen anderen Tabellen)',
      name: 'Club-Name',
      city: 'Stadt',
      lat: 'Breitengrad',
      lon: 'Längengrad',
      timezone: 'IANA-Zeitzone des Clubs (Default Europe/Berlin)',
      active: '1 = wird aktiv gepollt, 0 = deaktiviert',
    },
  },
  {
    key: 'courts',
    sql: `SELECT * FROM courts ORDER BY tenant_id, name`,
    description: 'Alle je gesehenen Courts (Plätze) je Club',
    columns: {
      resource_id: 'Playtomic-Resource-ID des Courts',
      tenant_id: 'Club (siehe clubs)',
      name: 'Court-Name',
      first_seen: 'Zeitstempel der ersten Beobachtung (ISO UTC)',
      last_seen: 'Zeitstempel der letzten Beobachtung (ISO UTC)',
    },
  },
  {
    key: 'club_summary',
    sql: `SELECT * FROM club_summary ORDER BY tenant_id`,
    description: 'KPI-Zusammenfassung je Club (Gold, gewichtete Aggregation über cell_stats)',
    columns: {
      tenant_id: 'Club (siehe clubs)',
      overall_util: 'Gesamtauslastung: booked/(booked+free) über alle Zellen (0..1)',
      prime_util: 'Auslastung in der Prime Time (siehe conventions.prime_time)',
      data_days: 'Anzahl Tage mit klassifizierten Slots (state != unknown)',
      updated_at: 'Zeitstempel des letzten ETL-Laufs (ISO UTC)',
    },
  },
  {
    key: 'club_cutoff',
    sql: `SELECT * FROM club_cutoff ORDER BY tenant_id`,
    description: 'Buchungs-Cutoff je Club in Minuten (Default 0, bis genug Daten vorhanden)',
    columns: {
      tenant_id: 'Club (siehe clubs)',
      cutoff_min: 'Minuten vor Slot-Start, ab denen keine Buchung mehr möglich ist',
      updated_at: 'Zeitstempel der letzten Aktualisierung (ISO UTC)',
    },
  },
  {
    key: 'data_quality',
    sql: `SELECT * FROM data_quality ORDER BY tenant_id, local_date`,
    description: 'Datenqualität je Club und Tag (Silver): wie gut war die Poll-Abdeckung?',
    columns: {
      tenant_id: 'Club (siehe clubs)',
      local_date: 'YYYY-MM-DD (UTC-Datum des Slot-Starts)',
      opening_polls: 'Anzahl distinct Opening-Polls an diesem Tag',
      slots_covered: 'Anzahl distinct beobachteter Court×Slot-Kombinationen',
      usable: '1 wenn >= 8 Opening-Polls an diesem Tag (Tag gilt als auswertbar)',
    },
  },
  {
    key: 'cell_stats',
    sql: `SELECT * FROM cell_stats ORDER BY tenant_id, weekday, hour_utc`,
    description: 'Heatmap-Zellen je Club × Wochentag × UTC-Stunde (Gold)',
    columns: {
      tenant_id: 'Club (siehe clubs)',
      weekday: 'Wochentag (siehe conventions.weekday)',
      hour_utc: 'Stunde in UTC (siehe conventions.hour_utc)',
      booked: 'Anzahl final gebuchter Slots in dieser Zelle',
      free: 'Anzahl final frei gebliebener Slots',
      n: 'booked + free (klassifizierte Slots; unknown ausgeschlossen)',
      utilization: 'booked/n (0..1); null wenn n=0',
      ci_low: 'Untergrenze 95%-Wilson-Konfidenzintervall (z=1.96); null wenn n<5',
      ci_high: 'Obergrenze 95%-Wilson-Konfidenzintervall; null wenn n<5',
      confident: '1 wenn n >= 5 (Zelle gilt als aussagekräftig)',
    },
  },
  {
    key: 'fill_curve',
    sql: `SELECT * FROM fill_curve ORDER BY tenant_id, weekday, hour_utc, lead_days`,
    description: 'Buchungs-Vorlaufkurve je Club × Zelle (Gold): wie früh buchen Kunden?',
    columns: {
      tenant_id: 'Club (siehe clubs)',
      weekday: 'Wochentag des Slots (siehe conventions.weekday)',
      hour_utc: 'Stunde des Slots in UTC',
      lead_days: 'Tage zwischen Horizon-Poll und Slot-Start (1..7)',
      p_booked:
        'Anteil der bei diesem Vorlauf im Horizon-Poll noch frei gesehenen Slots, die am Ende gebucht waren (0..1)',
      n: 'Stichprobengröße (beobachtete Slots bei diesem Vorlauf)',
    },
  },
  {
    key: 'slot_outcome',
    sql: `SELECT * FROM slot_outcome ORDER BY tenant_id, slot_start_utc, resource_id`,
    description: 'Finaler Buchungsstatus je vergangenem Slot (Silver, feinste exportierte Ebene)',
    columns: {
      resource_id: 'Court (siehe courts)',
      tenant_id: 'Club (siehe clubs)',
      slot_start_utc: 'Slot-Start als ISO-Zeitstempel in UTC',
      local_date: 'YYYY-MM-DD (UTC-Datum des Slot-Starts)',
      weekday: 'Wochentag (siehe conventions.weekday)',
      hour_utc: 'Stunde in UTC',
      state: "'booked' | 'free' | 'unknown' (siehe conventions.outcome_logic)",
      price: "Preis-String aus Playtomic (z.B. '28 EUR'), leer wenn unbekannt",
    },
  },
];

export async function getExportJson(db: D1Database): Promise<object> {
  const results = await db.batch(TABLES.map((t) => db.prepare(t.sql)));

  const data: Record<string, unknown[]> = {};
  const rowCounts: Record<string, number> = {};
  for (let i = 0; i < TABLES.length; i++) {
    const rows = results[i].results ?? [];
    data[TABLES[i].key] = rows;
    rowCounts[TABLES[i].key] = rows.length;
  }

  const clubMap: Record<string, string> = {};
  for (const c of data.clubs as { tenant_id: string; name: string }[]) {
    clubMap[c.tenant_id] = c.name;
  }

  const tablesMeta: Record<string, { description: string; columns: Record<string, string> }> = {};
  for (const t of TABLES) {
    tablesMeta[t.key] = { description: t.description, columns: t.columns };
  }

  return {
    meta: {
      title: 'Padel Auslastungs-Monitor – Datenexport',
      exported_at: new Date().toISOString(),
      source: 'Cloudflare Worker padels-analytics, D1-Datenbank padels-scraper-db',
      purpose:
        'Selbstbeschreibender Export der abgeleiteten Tabellen (Silver/Gold) des Playtomic-Padel-Auslastungs-Scrapers, optimiert für die Analyse durch ein LLM.',
      conventions: {
        weekday: '0=Montag, 1=Dienstag, 2=Mittwoch, 3=Donnerstag, 4=Freitag, 5=Samstag, 6=Sonntag',
        hour_utc: 'Stunde in UTC. Lokale Zeit Berlin = UTC+1 (Winter/CET) bzw. UTC+2 (Sommer/CEST).',
        prime_time:
          'Mo–Fr (weekday 0–4), hour_utc 17–21 inklusive (entspricht ca. 18–22 Uhr Berlin im Winter bzw. 19–23 Uhr im Sommer)',
        timestamps: 'Alle Zeitstempel in ISO 8601 UTC; local_date = YYYY-MM-DD des UTC-Slot-Starts',
        poll_types: {
          opening:
            'Poll alle 30 Minuten zwischen ca. 07:00 und 23:00 Uhr Berlin; erfasst freie Slots für heute und morgen',
          horizon:
            'Poll täglich 01:15 UTC; erfasst freie Slots für heute + 7 Tage voraus (definiert das Slot-Universum)',
        },
        outcome_logic:
          'Der letzte Opening-Poll vor Slot-Start entscheidet: Slot im Poll sichtbar = free, nicht sichtbar = booked, kein Poll vorhanden = unknown. Nur Slots aus Horizon-Polls der letzten 56 Tage werden (neu) klassifiziert; ältere Zeilen bleiben unverändert erhalten.',
      },
      clubs: clubMap,
      row_counts: rowCounts,
      excluded_tables: {
        availability_snapshots:
          'Rohdaten (jeder gescrapte freie Slot je Poll, mehrere hunderttausend Zeilen) – bewusst nicht exportiert; slot_outcome ist die daraus verdichtete Slot-Ebene',
        slot_envelope: 'Technische Öffnungszeiten-Hülle je Court, aus den anderen Tabellen ableitbar',
      },
      tables: tablesMeta,
    },
    data,
  };
}
