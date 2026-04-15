import { describe, expect, it } from 'vitest';
import { prodartsPlayerVisibility } from './prodarts-config.js';
import { reconstructX01FromRounds } from './prodarts.js';

describe('prodarts config', () => {
  it('maps merged aliases to canonical active names', () => {
    expect(prodartsPlayerVisibility('MariusAND')).toEqual({
      canonicalName: 'Marius',
      isPlayable: 1,
      statsVisible: 1,
    });
    expect(prodartsPlayerVisibility('Stefania.I')).toEqual({
      canonicalName: 'Stefania',
      isPlayable: 1,
      statsVisible: 1,
    });
    expect(prodartsPlayerVisibility('Alex A')).toEqual({
      canonicalName: 'Alex A',
      isPlayable: 0,
      statsVisible: 0,
    });
  });
});

describe('reconstructX01FromRounds', () => {
  it('reconstructs a simple straight-out single-leg game', () => {
    const game = {
      X01Game_id: 'g1',
      X01Game_sets: 1,
      X01Game_legs: 1,
      X01Game_checkOutMode: 0,
      X01Game_startPoints: 40,
      X01Game_listRounds: '1x20;1x1;2x10',
    };
    const participants = [
      { playerId: 1, placement: 1 },
      { playerId: 2, placement: 2 },
    ];

    const result = reconstructX01FromRounds(game, participants);

    expect(result.winnerIndex).toBe(0);
    expect(result.totalLegWins).toEqual([1, 0]);
    expect(result.legs).toHaveLength(1);
    expect(result.legs[0].darts).toHaveLength(3);
  });

  it('respects double-out bust rules', () => {
    const game = {
      X01Game_id: 'g2',
      X01Game_sets: 1,
      X01Game_legs: 1,
      X01Game_checkOutMode: 1,
      X01Game_startPoints: 20,
      X01Game_listRounds: '1x20;2x10',
    };
    const participants = [
      { playerId: 1, placement: 2 },
      { playerId: 2, placement: 1 },
    ];

    const result = reconstructX01FromRounds(game, participants);

    expect(result.winnerIndex).toBe(1);
    expect(result.legs[0].darts[0].busted).toBe(1);
    expect(result.totalLegWins).toEqual([0, 1]);
  });

  it('handles best-of-three sets with one leg per set', () => {
    const game = {
      X01Game_id: 'g3',
      X01Game_sets: 3,
      X01Game_legs: 1,
      X01Game_checkOutMode: 0,
      X01Game_startPoints: 32,
      X01Game_listRounds: '2x16;1x1#1x1;2x16',
    };
    const participants = [
      { playerId: 1, placement: 1 },
      { playerId: 2, placement: 2 },
    ];

    const result = reconstructX01FromRounds(game, participants);

    expect(result.setsToWin).toBe(2);
    expect(result.totalLegWins).toEqual([2, 0]);
    expect(result.setWins).toEqual([2, 0]);
    expect(result.legs).toHaveLength(2);
  });
});
