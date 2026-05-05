export const POSITIONS = ['attack', 'midfield', 'defence'] as const;
export type Position = (typeof POSITIONS)[number];

export type Player = {
  id: string;
  name: string;
  primary_position: Position;
  secondary_position: Position | null;
  max_block_minutes: number;
  max_total_minutes: number;
  skill_score: number;
  is_goalkeeper: boolean;
  created_at: string;
  updated_at: string;
};

export type PublicPlayer = Omit<Player, 'skill_score'>;
