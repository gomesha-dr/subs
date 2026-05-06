export const POSITIONS = ['attack', 'midfield', 'defence'] as const;
export type Position = (typeof POSITIONS)[number];

export type Player = {
  id: string;
  name: string;
  pref_1_position: Position;
  pref_2_position: Position;
  pref_3_position: Position;
  max_block_minutes: number;
  max_total_minutes: number;
  skill_score: number;
  is_goalkeeper: boolean;
  created_at: string;
  updated_at: string;
};

export type PublicPlayer = Omit<Player, 'skill_score'>;

/** Returns the ranked preference (1, 2, or 3) for a given position. */
export function positionRank(player: { pref_1_position: Position; pref_2_position: Position; pref_3_position: Position }, position: Position): 1 | 2 | 3 {
  if (player.pref_1_position === position) return 1;
  if (player.pref_2_position === position) return 2;
  return 3;
}

export type Match = {
  id: string;
  match_date: string;
  match_time: string | null;
  duration_minutes: number;
  half_length_minutes: number;
  goalkeeper_id: string | null;
  notes: string | null;
  formation: string | null;
  generated_schedule: unknown | null;
  created_at: string;
  updated_at: string;
};

export type MatchAttendance = {
  match_id: string;
  player_id: string;
  is_attending: boolean;
  override_primary_position: Position | null;
  override_secondary_position: Position | null;
  override_max_block_minutes: number | null;
  override_max_total_minutes: number | null;
  override_skill_score: number | null;
  created_at: string;
  updated_at: string;
};

export type PublicMatchAttendance = Omit<MatchAttendance, 'override_skill_score'>;
