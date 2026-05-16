import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { prodartsPlayerVisibility } from './prodarts-config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_PRODARTS_DIR = join(__dirname, '..', '..', '..', 'ProDarts');

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function sqliteDateTimeFromMs(ms, offsetSeconds = 0) {
  const value = Number(ms);
  if (!Number.isFinite(value) || value <= 0) return null;
  return new Date(value + offsetSeconds * 1000).toISOString().slice(0, 19).replace('T', ' ');
}

function scoreValue(segment, multiplier) {
  return segment * multiplier;
}

function isBust(newRemaining, multiplier, doubleOut) {
  if (newRemaining < 0) return true;
  if (doubleOut) {
    if (newRemaining === 1) return true;
    if (newRemaining === 0 && multiplier !== 2) return true;
  }
  return false;
}

function parseVisit(visitString) {
  return String(visitString ?? '')
    .split('#')
    .filter(Boolean)
    .map((token) => {
      const match = token.match(/^(\d+)x(\d+)$/);
      if (!match) throw new Error(`Invalid ProDarts token: ${token}`);
      return { multiplier: Number(match[1]), segment: Number(match[2]) };
    });
}

export function reconstructX01FromRounds(game, participants) {
  const playerCount = participants.length;
  if (playerCount < 2) {
    throw new Error(`Game ${game.X01Game_id} has fewer than 2 players`);
  }

  const setsConfigured = Math.max(1, Number(game.X01Game_sets ?? 1));
  const legsConfigured = Math.max(1, Number(game.X01Game_legs ?? 1));
  const setsToWin = Math.max(1, Math.ceil(setsConfigured / 2));
  const legsPerSet = Math.max(1, legsConfigured);
  const legsToWinInSet = Math.max(1, Math.ceil(legsPerSet / 2));
  const doubleOut = Number(game.X01Game_checkOutMode ?? 0) === 1;
  const startPoints = Number(game.X01Game_startPoints ?? 501);

  let starterIndex = 0;
  let currentPlayerIndex = starterIndex;
  let setNumber = 1;
  let legNumber = 1;
  let eventCounter = 0;
  let winnerIndex = null;
  let finished = false;

  const setWins = Array(playerCount).fill(0);
  const totalLegWins = Array(playerCount).fill(0);
  let setLegWins = Array(playerCount).fill(0);
  let remaining = Array(playerCount).fill(startPoints);
  let playerTurnNumbers = Array(playerCount).fill(0);
  const legs = [];
  const warnings = [];

  function startNewLeg() {
    return {
      legNumber,
      setNumber,
      startingPlayerIndex: starterIndex,
      winnerIndex: null,
      darts: [],
    };
  }

  let currentLeg = startNewLeg();
  const visits = String(game.X01Game_listRounds ?? '')
    .split(';')
    .filter(Boolean)
    .map(parseVisit);

  for (const visit of visits) {
    if (finished) {
      warnings.push('Extra ProDarts rounds remained after imported match finished');
      break;
    }

    playerTurnNumbers[currentPlayerIndex] += 1;
    const turnNumber = playerTurnNumbers[currentPlayerIndex];
    let turnRemaining = remaining[currentPlayerIndex];
    let busted = false;
    let legFinishedThisVisit = false;

    for (let i = 0; i < visit.length; i++) {
      const dart = visit[i];
      const nextRemaining = turnRemaining - scoreValue(dart.segment, dart.multiplier);
      const dartBusted = isBust(nextRemaining, dart.multiplier, doubleOut);

      currentLeg.darts.push({
        playerIndex: currentPlayerIndex,
        turnNumber,
        dartInTurn: i + 1,
        segment: dart.segment,
        multiplier: dart.multiplier,
        scoreValue: scoreValue(dart.segment, dart.multiplier),
        busted: dartBusted ? 1 : 0,
        offsetSeconds: eventCounter++,
      });

      if (dartBusted) {
        busted = true;
        break;
      }

      turnRemaining = nextRemaining;

      if (turnRemaining === 0) {
        remaining[currentPlayerIndex] = 0;
        currentLeg.winnerIndex = currentPlayerIndex;
        totalLegWins[currentPlayerIndex] += 1;
        setLegWins[currentPlayerIndex] += 1;
        legs.push(currentLeg);

        if (setLegWins[currentPlayerIndex] >= legsToWinInSet) {
          setWins[currentPlayerIndex] += 1;
          if (setWins[currentPlayerIndex] >= setsToWin) {
            winnerIndex = currentPlayerIndex;
            finished = true;
            break;
          }

          setLegWins = Array(playerCount).fill(0);
          setNumber += 1;
        }

        starterIndex = (starterIndex + 1) % playerCount;
        currentPlayerIndex = starterIndex;
        legNumber += 1;
        remaining = Array(playerCount).fill(startPoints);
        playerTurnNumbers = Array(playerCount).fill(0);
        currentLeg = startNewLeg();
        legFinishedThisVisit = true;
        break;
      }
    }

    if (finished) break;

    if (legFinishedThisVisit) {
      continue;
    }

    if (!busted) {
      remaining[currentPlayerIndex] = turnRemaining;
    }

    currentPlayerIndex = (currentPlayerIndex + 1) % playerCount;
  }

  if (!finished) {
    const placedWinner = participants.findIndex((participant) => participant.placement === 1);
    if (placedWinner >= 0 && legs.length > 0) {
      winnerIndex = placedWinner;
      warnings.push('Winner inferred from ProDarts placement because match did not fully resolve');
    } else {
      throw new Error(`Unable to fully reconstruct ProDarts game ${game.X01Game_id}`);
    }
  }

  return {
    winnerIndex,
    setWins,
    totalLegWins,
    setsToWin,
    legsPerSet,
    legsToWinInSet,
    legs,
    warnings,
  };
}

export function loadProdartsExport(prodartsDir = DEFAULT_PRODARTS_DIR) {
  return {
    dir: prodartsDir,
    players: readJson(join(prodartsDir, 'raw_Player.json')),
    playerInPlayable: readJson(join(prodartsDir, 'raw_PlayerInPlayable.json')),
    x01Games: readJson(join(prodartsDir, 'raw_X01Game.json')),
  };
}

function upsertSourceSnapshots(db, data) {
  const insertPlayer = db.prepare(`
    INSERT INTO prodarts_players (
      prodarts_id, name, display_name, password_hash, online, last_reset_at_ms,
      only_for_help, created_at_ms, sync_games, sync_tournaments, sync_trainings, raw_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(prodarts_id) DO UPDATE SET
      name = excluded.name,
      display_name = excluded.display_name,
      password_hash = excluded.password_hash,
      online = excluded.online,
      last_reset_at_ms = excluded.last_reset_at_ms,
      only_for_help = excluded.only_for_help,
      created_at_ms = excluded.created_at_ms,
      sync_games = excluded.sync_games,
      sync_tournaments = excluded.sync_tournaments,
      sync_trainings = excluded.sync_trainings,
      raw_json = excluded.raw_json,
      imported_at = datetime('now')
  `);
  const insertGame = db.prepare(`
    INSERT INTO prodarts_x01_games (
      prodarts_id, state, timestamp_ms, played_at_ms, need_to_sync, deleted, beginner,
      draw_mode, sets, legs, deciding_leg_beginner, list_rounds, tournament_id,
      tournament_game_idx, online, evaluated, elo_change_1, elo_change_2,
      start_points, check_in_mode, check_out_mode, raw_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(prodarts_id) DO UPDATE SET
      state = excluded.state,
      timestamp_ms = excluded.timestamp_ms,
      played_at_ms = excluded.played_at_ms,
      need_to_sync = excluded.need_to_sync,
      deleted = excluded.deleted,
      beginner = excluded.beginner,
      draw_mode = excluded.draw_mode,
      sets = excluded.sets,
      legs = excluded.legs,
      deciding_leg_beginner = excluded.deciding_leg_beginner,
      list_rounds = excluded.list_rounds,
      tournament_id = excluded.tournament_id,
      tournament_game_idx = excluded.tournament_game_idx,
      online = excluded.online,
      evaluated = excluded.evaluated,
      elo_change_1 = excluded.elo_change_1,
      elo_change_2 = excluded.elo_change_2,
      start_points = excluded.start_points,
      check_in_mode = excluded.check_in_mode,
      check_out_mode = excluded.check_out_mode,
      raw_json = excluded.raw_json,
      imported_at = datetime('now')
  `);
  const insertJoin = db.prepare(`
    INSERT INTO prodarts_player_in_playable (
      prodarts_id, player_id, playable_id, order_number, placement, deleted, raw_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(prodarts_id) DO UPDATE SET
      player_id = excluded.player_id,
      playable_id = excluded.playable_id,
      order_number = excluded.order_number,
      placement = excluded.placement,
      deleted = excluded.deleted,
      raw_json = excluded.raw_json,
      imported_at = datetime('now')
  `);

  for (const player of data.players) {
    insertPlayer.run(
      player.Player_id,
      player.Player_name,
      player.Player_displayName,
      player.Player_password,
      player.Player_online,
      player.Player_lastStatisticReset,
      player.Player_onlyForHelp,
      player.Player_created,
      player.Player_syncTimestampGames,
      player.Player_syncTimestampTournaments,
      player.Player_syncTimestampTrainings,
      JSON.stringify(player)
    );
  }

  for (const game of data.x01Games) {
    insertGame.run(
      game.X01Game_id,
      game.X01Game_state,
      game.X01Game_timestamp,
      game.X01Game_played,
      game.X01Game_needToSync,
      game.X01Game_deleted,
      game.X01Game_beginner,
      game.X01Game_drawMode,
      game.X01Game_sets,
      game.X01Game_legs,
      game.X01Game_decidingLegBeginner,
      game.X01Game_listRounds,
      game.X01Game_tournamentId,
      game.X01Game_tournamentGameIdx,
      game.X01Game_online,
      game.X01Game_evaluated,
      game.X01Game_eloChange1,
      game.X01Game_eloChange2,
      game.X01Game_startPoints,
      game.X01Game_checkInMode,
      game.X01Game_checkOutMode,
      JSON.stringify(game)
    );
  }

  for (const link of data.playerInPlayable) {
    insertJoin.run(
      link.PlayerInPlayable_id,
      link.PlayerInPlayable_playerId,
      link.PlayerInPlayable_playableId,
      link.PlayerInPlayable_orderNumber,
      link.PlayerInPlayable_placement,
      link.PlayerInPlayable_deleted,
      JSON.stringify(link)
    );
  }
}

function ensureCanonicalPlayers(db, prodartsPlayers) {
  const selectPlayerByName = db.prepare('SELECT * FROM players WHERE name = ? LIMIT 1');
  const insertPlayer = db.prepare(`
    INSERT INTO players (
      name, nickname, color, created_at, is_playable, stats_visible, source_type, source_ref
    ) VALUES (?, ?, ?, COALESCE(?, datetime('now')), ?, ?, ?, ?)
  `);
  const updatePlayer = db.prepare(`
    UPDATE players
    SET is_playable = MAX(is_playable, ?),
        stats_visible = MAX(stats_visible, ?),
        source_type = COALESCE(source_type, ?),
        source_ref = COALESCE(source_ref, ?)
    WHERE id = ?
  `);
  const upsertMapping = db.prepare(`
    INSERT INTO prodarts_player_mappings (
      prodarts_player_id, canonical_name, canonical_player_id, is_playable,
      stats_visible, merged_into_name, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(prodarts_player_id) DO UPDATE SET
      canonical_name = excluded.canonical_name,
      canonical_player_id = excluded.canonical_player_id,
      is_playable = excluded.is_playable,
      stats_visible = excluded.stats_visible,
      merged_into_name = excluded.merged_into_name,
      updated_at = datetime('now')
  `);

  const playerIdsByProdartsId = new Map();
  let created = 0;
  let updated = 0;

  for (const prodartsPlayer of prodartsPlayers) {
    const sourceName = prodartsPlayer.Player_displayName || prodartsPlayer.Player_name;
    const visibility = prodartsPlayerVisibility(sourceName);
    let player = selectPlayerByName.get(visibility.canonicalName);

    if (!player) {
      const result = insertPlayer.run(
        visibility.canonicalName,
        sourceName !== visibility.canonicalName ? sourceName : null,
        '#e63946',
        sqliteDateTimeFromMs(prodartsPlayer.Player_created),
        visibility.isPlayable,
        visibility.statsVisible,
        'prodarts',
        prodartsPlayer.Player_id
      );
      created += 1;
      player = selectPlayerByName.get(result.lastInsertRowid ? visibility.canonicalName : visibility.canonicalName);
    } else {
      updatePlayer.run(
        visibility.isPlayable,
        visibility.statsVisible,
        'prodarts',
        prodartsPlayer.Player_id,
        player.id
      );
      updated += 1;
      player = selectPlayerByName.get(visibility.canonicalName);
    }

    playerIdsByProdartsId.set(prodartsPlayer.Player_id, player.id);
    upsertMapping.run(
      prodartsPlayer.Player_id,
      visibility.canonicalName,
      player.id,
      visibility.isPlayable,
      visibility.statsVisible,
      visibility.canonicalName !== sourceName ? visibility.canonicalName : null
    );
  }

  return { playerIdsByProdartsId, created, updated };
}

function averageBeforeImport(db, playerId) {
  return db.prepare(`
    SELECT ROUND((SUM(CASE WHEN d.busted = 0 THEN d.score_value ELSE 0 END) * 3.0) / NULLIF(COUNT(*), 0), 2) AS avg
    FROM darts d
    JOIN legs l ON l.id = d.leg_id
    JOIN matches m ON m.id = l.match_id
    WHERE d.player_id = ? AND m.status = 'finished'
  `).get(playerId)?.avg ?? 0;
}

function participantGroups(playerInPlayable) {
  const byPlayableId = new Map();
  for (const link of playerInPlayable) {
    if (Number(link.PlayerInPlayable_deleted) === 1) continue;
    const group = byPlayableId.get(link.PlayerInPlayable_playableId) ?? [];
    group.push(link);
    byPlayableId.set(link.PlayerInPlayable_playableId, group);
  }

  for (const list of byPlayableId.values()) {
    list.sort((a, b) => a.PlayerInPlayable_orderNumber - b.PlayerInPlayable_orderNumber);
  }

  return byPlayableId;
}

function publicCodeForProdartsGame(prodartsId) {
  return `PD-${String(prodartsId).replace(/[^a-zA-Z0-9]/g, '').slice(0, 8).toUpperCase()}`;
}

function importSingleMatch(db, game, participants, canonicalPlayerIds) {
  const normalizedParticipants = participants.map((participant) => ({
    prodartsPlayerId: participant.PlayerInPlayable_playerId,
    playerId: canonicalPlayerIds.get(participant.PlayerInPlayable_playerId),
    orderNumber: participant.PlayerInPlayable_orderNumber,
    placement: participant.PlayerInPlayable_placement,
  }));

  if (normalizedParticipants.some((participant) => !participant.playerId)) {
    throw new Error(`Game ${game.X01Game_id} references unmapped players`);
  }

  const reconstructed = reconstructX01FromRounds(game, normalizedParticipants);
  const winnerId = normalizedParticipants[reconstructed.winnerIndex]?.playerId ?? null;
  if (!winnerId) throw new Error(`Game ${game.X01Game_id} has no canonical winner`);

  const createdAt = sqliteDateTimeFromMs(game.X01Game_played ?? game.X01Game_timestamp);
  const endedAt = sqliteDateTimeFromMs(game.X01Game_timestamp ?? game.X01Game_played);
  const payload = JSON.stringify({
    prodarts_sets: game.X01Game_sets,
    prodarts_legs: game.X01Game_legs,
    placements: normalizedParticipants.map((participant) => ({
      prodarts_player_id: participant.prodartsPlayerId,
      player_id: participant.playerId,
      placement: participant.placement,
      order_number: participant.orderNumber,
    })),
    warnings: reconstructed.warnings,
  });

  const insertMatch = db.prepare(`
    INSERT INTO matches (
      mode, starting_score, double_out, legs_to_win, sets_to_win, legs_per_set, public_code,
      created_at, started_at, ended_at, winner_id, source_type, source_ref, source_payload, status
    ) VALUES ('x01', ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')), ?, ?, ?, ?, ?, ?, 'finished')
  `);
  const matchResult = insertMatch.run(
    game.X01Game_startPoints,
    Number(game.X01Game_checkOutMode ?? 0) === 1 ? 1 : 0,
    reconstructed.legsToWinInSet,
    reconstructed.setsToWin,
    reconstructed.legsPerSet,
    publicCodeForProdartsGame(game.X01Game_id),
    createdAt,
    createdAt,
    endedAt ?? createdAt,
    winnerId,
    'prodarts_x01',
    game.X01Game_id,
    payload
  );
  const matchId = Number(matchResult.lastInsertRowid);

  const insertMatchPlayer = db.prepare(`
    INSERT INTO match_players (
      match_id, player_id, position, legs_won, sets_won, general_avg_start
    ) VALUES (?, ?, ?, ?, ?, ?)
  `);
  for (let index = 0; index < normalizedParticipants.length; index++) {
    const participant = normalizedParticipants[index];
    insertMatchPlayer.run(
      matchId,
      participant.playerId,
      index,
      reconstructed.totalLegWins[index] ?? 0,
      reconstructed.setWins[index] ?? 0,
      averageBeforeImport(db, participant.playerId)
    );
  }

  const insertLeg = db.prepare(`
    INSERT INTO legs (
      match_id, leg_number, set_number, starting_id, winner_id, started_at, ended_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const insertDart = db.prepare(`
    INSERT INTO darts (
      leg_id, player_id, turn_number, dart_in_turn, segment, multiplier, score_value, busted, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const leg of reconstructed.legs) {
    const starterId = normalizedParticipants[leg.startingPlayerIndex].playerId;
    const legWinnerId = normalizedParticipants[leg.winnerIndex]?.playerId ?? null;
    const legStartedAt = sqliteDateTimeFromMs(game.X01Game_played ?? game.X01Game_timestamp, leg.legNumber - 1);
    const legEndedAt = sqliteDateTimeFromMs(game.X01Game_played ?? game.X01Game_timestamp, leg.legNumber);
    const legResult = insertLeg.run(
      matchId,
      leg.legNumber,
      leg.setNumber,
      starterId,
      legWinnerId,
      legStartedAt,
      legEndedAt
    );
    const legId = Number(legResult.lastInsertRowid);

    for (const dart of leg.darts) {
      insertDart.run(
        legId,
        normalizedParticipants[dart.playerIndex].playerId,
        dart.turnNumber,
        dart.dartInTurn,
        dart.segment,
        dart.multiplier,
        dart.scoreValue,
        dart.busted,
        sqliteDateTimeFromMs(game.X01Game_played ?? game.X01Game_timestamp, dart.offsetSeconds)
      );
    }
  }

  db.prepare(`
    INSERT INTO prodarts_match_mappings (
      prodarts_game_id, dartsleague_match_id, import_status, import_error, imported_at, last_attempted_at
    ) VALUES (?, ?, 'imported', NULL, datetime('now'), datetime('now'))
    ON CONFLICT(prodarts_game_id) DO UPDATE SET
      dartsleague_match_id = excluded.dartsleague_match_id,
      import_status = 'imported',
      import_error = NULL,
      imported_at = datetime('now'),
      last_attempted_at = datetime('now')
  `).run(game.X01Game_id, matchId);

  return { matchId, warnings: reconstructed.warnings };
}

export function importProdartsX01({ db, prodartsDir = DEFAULT_PRODARTS_DIR } = {}) {
  const data = loadProdartsExport(prodartsDir);
  const playerGroups = participantGroups(data.playerInPlayable);
  const games = data.x01Games
    .filter((game) => Number(game.X01Game_deleted ?? 0) === 0)
    .sort((a, b) => Number(a.X01Game_played ?? 0) - Number(b.X01Game_played ?? 0));

  const summary = {
    sourcePlayers: data.players.length,
    sourceGames: games.length,
    canonicalPlayersCreated: 0,
    canonicalPlayersUpdated: 0,
    matchesImported: 0,
    matchesSkipped: 0,
    matchesFailed: 0,
    warnings: [],
  };

  db.transaction(() => {
    upsertSourceSnapshots(db, data);
    const canonical = ensureCanonicalPlayers(db, data.players);
    summary.canonicalPlayersCreated = canonical.created;
    summary.canonicalPlayersUpdated = canonical.updated;

    for (const game of games) {
      const existing = db.prepare(`
        SELECT dartsleague_match_id
        FROM prodarts_match_mappings
        WHERE prodarts_game_id = ? AND import_status = 'imported'
      `).get(game.X01Game_id);

      if (existing?.dartsleague_match_id) {
        summary.matchesSkipped += 1;
        continue;
      }

      const participants = playerGroups.get(game.X01Game_id) ?? [];
      try {
        const result = importSingleMatch(db, game, participants, canonical.playerIdsByProdartsId);
        summary.matchesImported += 1;
        summary.warnings.push(...result.warnings.map((warning) => `${game.X01Game_id}: ${warning}`));
      } catch (error) {
        summary.matchesFailed += 1;
        db.prepare(`
          INSERT INTO prodarts_match_mappings (
            prodarts_game_id, dartsleague_match_id, import_status, import_error, imported_at, last_attempted_at
          ) VALUES (?, NULL, 'failed', ?, NULL, datetime('now'))
          ON CONFLICT(prodarts_game_id) DO UPDATE SET
            import_status = 'failed',
            import_error = excluded.import_error,
            last_attempted_at = datetime('now')
        `).run(game.X01Game_id, error.message);
      }
    }
  })();

  return summary;
}

export function getProdartsImportStatus(db) {
  const sourceCounts = {
    players: db.prepare('SELECT COUNT(*) AS count FROM prodarts_players').get()?.count ?? 0,
    games: db.prepare('SELECT COUNT(*) AS count FROM prodarts_x01_games').get()?.count ?? 0,
    links: db.prepare('SELECT COUNT(*) AS count FROM prodarts_player_in_playable').get()?.count ?? 0,
  };

  const mappingCounts = db.prepare(`
    SELECT
      SUM(CASE WHEN import_status = 'imported' THEN 1 ELSE 0 END) AS imported,
      SUM(CASE WHEN import_status = 'failed' THEN 1 ELSE 0 END) AS failed,
      SUM(CASE WHEN import_status = 'pending' THEN 1 ELSE 0 END) AS pending
    FROM prodarts_match_mappings
  `).get() ?? { imported: 0, failed: 0, pending: 0 };

  const players = db.prepare(`
    SELECT name, nickname, is_playable, stats_visible, source_type
    FROM players
    WHERE source_type = 'prodarts' OR source_type IS NULL
    ORDER BY stats_visible DESC, is_playable DESC, name ASC
  `).all();

  const recentFailures = db.prepare(`
    SELECT prodarts_game_id, import_error, last_attempted_at
    FROM prodarts_match_mappings
    WHERE import_status = 'failed'
    ORDER BY last_attempted_at DESC
    LIMIT 10
  `).all();

  return {
    sourceCounts,
    mappingCounts,
    players,
    recentFailures,
  };
}

export function defaultProdartsDir() {
  return DEFAULT_PRODARTS_DIR;
}
